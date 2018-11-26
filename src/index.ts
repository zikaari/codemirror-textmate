import * as CodeMirror from 'codemirror'
import { INITIAL, IRawTheme, StackElement } from 'monaco-textmate'
import * as PCancelable from 'p-cancelable'
import { Highlighter } from './Highlighter'

export interface ITextmateThemePlus extends IRawTheme {
    gutterSettings?: {
        background: string
        divider: string
        foreground: string
        lineActiveBackground: string
        lineActiveForeground: string
    }
}

export const addGrammar = Highlighter.addGrammar
export const activateLanguage = Highlighter.activateLanguage

/**
 * Inject grammars into grammars
 * Returns an array of language ID's that were udpated
 * 
 * @param scopeName Scope name that needs to be injected into other grammars
 * @param injectInto List of host scope names
 */
export async function linkInjections(scopeName: string, injectInto: string[]) {
    const affectedLanguages = Highlighter.linkInjections(scopeName, injectInto)
    await updateCmTmBindings(null, affectedLanguages)
    return affectedLanguages
}

/**
 * Uninject grammars out of grammars
 * Returns an array of language ID's that were udpated
 * 
 * @param scopeName Scope name that needs to be uninjected out of other grammars
 * @param unInjectFrom  If provided, scope name will be uninjected only from this list of host scope names, otherwise will be uninjected from all
 */
export async function unlinkInjections(scopeName: string, unInjectFrom: string[]) {
    const affectedLanguages = Highlighter.unlinkInjections(scopeName, unInjectFrom)
    await updateCmTmBindings(null, affectedLanguages)
    return affectedLanguages
}

const themedHighlighters: Map<string, Highlighter> = new Map()
themedHighlighters.set('default', new Highlighter())

/**
 * Add a Textmate theme to CodeMirror
 * 
 * @param theme Theme object
 */
export function addTheme(theme: ITextmateThemePlus): void {
    // TODO: add regex check to theme.name to make sure it's valid CSS classname too
    if (typeof theme.name !== 'string') {
        throw new Error(`RawTheme must have 'name' property for referencing purposes`)
    }
    themedHighlighters.set(theme.name, new Highlighter(theme))
}

const updateCmTmBindings = (() => {
    // local "static" variables
    const cmModeToTheme: Map<string /* languageID */, string /* theme */> = new Map()
    const cmThemeRecord: WeakMap<CodeMirror.Editor, string /* theme */> = new WeakMap()
    const tmThemeStyleNodes: Map<string, { styleNode: HTMLStyleElement; inUseBy: WeakSet<CodeMirror.Editor>; inUseByCount: number }> = new Map()
    /**
     * wrapper around CodeMirror.defineMode
     * If CodeMirror.defineMode is directly called in the primary function below, it causes memory leak by not letting go of cm variable (forms a closure?)
     */
    const defineMode = (languageId: string, tokenizer: any) => {
        CodeMirror.defineMode<{ ruleStack: StackElement }>(languageId, () => {
            return {
                copyState: (state) => ({ ruleStack: state.ruleStack.clone() }),
                startState: () => ({ ruleStack: INITIAL }),
                token: tokenizer,
            }
        })
    }

    return (cm: CodeMirror.Editor, invalidateLanguages?: string[]) => new PCancelable<boolean>(async (resolve, reject, onCancel) => {
        (onCancel as any).shouldReject = false
        let canceled = false
        onCancel(() => canceled = true)

        if (!cm) {
            if (Array.isArray(invalidateLanguages)) {
                await Promise.all(invalidateLanguages.map(async (lang) => {
                    // invalidate previously defined CM mode
                    if (cmModeToTheme.delete(lang)) {
                        // preload update
                        await Highlighter.loadLanguage(lang)
                    }
                }))
            }
            return resolve(false)
        }

        const languageId = cm.getOption('mode')
        const themeName = cm.getOption('theme')
        // get theme name that was bound last time this mode was baked
        const languageBoundTheme = cmModeToTheme.get(languageId)
        const prevThemeName = cmThemeRecord.get(cm) || 'default'

        const highlighter = themedHighlighters.get(themeName) || themedHighlighters.get('default')
        const isTextMateTheme = themeName !== 'default' && themedHighlighters.has(themeName)

        cmThemeRecord.set(cm, themeName)
        if (Highlighter.hasLanguageRegistered(languageId)) {
            cmModeToTheme.set(languageId, themeName)
        }

        // Cleanup previous theme resources (if any)
        if (typeof prevThemeName === 'string' &&
            prevThemeName !== 'default' &&
            prevThemeName !== themeName &&
            themedHighlighters.has(themeName) &&
            tmThemeStyleNodes.has(prevThemeName)) {
            const meta = tmThemeStyleNodes.get(prevThemeName)
            if (meta.inUseBy.has(cm) && meta.inUseByCount === 1) {
                tmThemeStyleNodes.delete(prevThemeName)
                document.head.removeChild(meta.styleNode)
            } else {
                meta.inUseBy.delete(cm)
                meta.inUseByCount--
            }
        }

        // Allocate new theme resources (if applicable)
        if (isTextMateTheme) {
            if (tmThemeStyleNodes.has(themeName)) {
                const meta = tmThemeStyleNodes.get(themeName)
                if (!meta.inUseBy.has(cm)) {
                    meta.inUseBy.add(cm)
                    meta.inUseByCount++
                }
            } else {
                const styleNode = document.createElement('style')
                styleNode.textContent = highlighter.cssText
                tmThemeStyleNodes.set(themeName, { styleNode, inUseBy: new WeakSet().add(cm), inUseByCount: 1 })
                document.head.appendChild(styleNode)
            }
        }

        // Nothing much "changed", hence nothing much is needs to be done
        if (typeof languageId === 'string' && typeof themeName === 'string' && typeof languageBoundTheme === 'string' &&
            // new theme is same as theme that was baked with language previously
            languageBoundTheme === themeName) {
            return resolve(prevThemeName !== themeName)
        }

        // skip if language id cannot be resolved to tm grammar scope
        if (!Highlighter.hasLanguageRegistered(languageId)) {
            return resolve(false)
        }

        const tokenizer = await highlighter.getTokenizer(languageId)

        // user probably changed theme or mode in the meantime, this fn will be triggered again anyway
        if (canceled) {
            return resolve(false)
        }

        defineMode(languageId, tokenizer)

        resolve(true)
    })
})()

/**
 * Wrapper around `udpateCmTmBindings` that prevents race conditions and obsolute changes
 * Will queue all the CM instances that need an update and will update them one by one (while merging duplicate instances)
 */
const safeUpdateCM = (() => {
    const queue: CodeMirror.Editor[] = []
    const resolverCallbacks: WeakMap<CodeMirror.Editor, (success: boolean) => void> = new WeakMap()
    let currentActivation: PCancelable.PCancelable<boolean>
    const proceed = async () => {
        const nextCM = queue[0]
        if (!nextCM) {
            return
        }
        currentActivation = updateCmTmBindings(nextCM)
        const resolver = resolverCallbacks.get(nextCM)
        resolver(await currentActivation)
        resolverCallbacks.delete(nextCM)
        queue.shift()
        currentActivation = null
        proceed()
    }

    return async (cm: CodeMirror.Editor) => {
        // currently happening but now obsolete
        if (queue[0] === cm && currentActivation) {
            currentActivation.cancel()
            const prevResolver = resolverCallbacks.get(cm)
            resolverCallbacks.delete(cm)
            queue.shift()
            queue.push(cm)
            prevResolver(false)
        }
        // if hasn't been queued up yet then do it
        if (queue.indexOf(cm) === -1) {
            queue.push(cm)
        }
        const prom = new Promise<boolean>((res) => {
            resolverCallbacks.set(cm, res)
        })
        // No work is being done === queue not proceeding => start the queue
        if (!currentActivation) {
            proceed()
        }

        return prom
    }
})()

CodeMirror.defineInitHook(async (cm: CodeMirror.Editor) => {
    let shouldIgnoreNextEvent = false
    let lastLanguageId = null
    async function updateInstance() {
        const langId = cm.getOption('mode')
        if (shouldIgnoreNextEvent && langId === lastLanguageId) {
            shouldIgnoreNextEvent = false
            return
        }

        if (await safeUpdateCM(cm)) {
            lastLanguageId = langId
            shouldIgnoreNextEvent = true
            cm.setOption('mode', langId)
        }
    }

    cm.on('swapDoc', updateInstance)
    cm.on('optionChange' as any, (inst, option: unknown) => {
        if (option === 'mode' || option === 'theme') {
            updateInstance()
        }
    })

    updateInstance()
})
