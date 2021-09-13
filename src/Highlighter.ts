import { IGrammar, IRawGrammar, IRawTheme, IToken, Registry, StackElement } from 'monaco-textmate'
import { Theme } from 'monaco-textmate/dist/theme'
import { tmScopeToCmToken, cssTextFromTmTheme } from './tmToCm'
import { ITextmateThemePlus } from '.';

export type IRawGrammarSource = IRawGrammar | Promise<IRawGrammar> | ((scopeName: string) => IRawGrammar | Promise<IRawGrammar>)

export interface IHighlighterState {
    ruleStack: StackElement
    tokensCache: IToken[]
}

const requestIdle = (ms = 10000) => new Promise<void>((res) => {
    if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(res, { timeout: ms })
    } else {
        setTimeout(res, ms)
    }
})

class Highlighter {
    public static addGrammar(scopeName: string, grammar: IRawGrammarSource): void {
        Highlighter.scopeNameToRawGrammars.set(scopeName, grammar)
    }

    /**
     * Inject grammars
     * @param scopeName Scope name to inject
     * @param injectInto List of host scope names who will suffer the injection
     */
    public static linkInjections(scopeName: string, injectInto: string[]) {
        if (!Array.isArray(injectInto) || !injectInto.every((scope) => typeof scope === 'string')) {
            throw new TypeError(`Second argument to 'linkInjections' must be an array of strings (scope names)`)
        }
        const affectedLanguages = new Set<string>()
        injectInto.forEach((scope) => {
            if (Highlighter.scopeNameToInjections.has(scope)) {
                Highlighter.scopeNameToInjections.get(scope).add(scopeName)
            } else {
                Highlighter.scopeNameToInjections.set(scope, new Set<string>().add(scopeName))
            }
            if (Highlighter.scopeNameToLanguageId.has(scope)) {
                affectedLanguages.add(Highlighter.scopeNameToLanguageId.get(scope))
            }
        })
        // Purge existing registry
        Highlighter.registry = null
        return Array.from(affectedLanguages)
    }

    /**
     * Uninject grammars
     * @param scopeName Previously injected scope name to uninject
     * @param injections If provided injected scope name will be uninjected only from this list of host scope names, otherwise will be uninjected from all
     */
    public static unlinkInjections(scopeName: string, injections?: string[]) {
        if (!Highlighter.scopeNameToInjections.has(scopeName)) {
            return
        }
        const affectedLanguages = new Set<string>()
        if (!injections) {
            Highlighter.scopeNameToInjections.forEach((injectionList, hostScopeName) => {
                if (injectionList.has(scopeName)) {
                    if (Highlighter.scopeNameToLanguageId.has(hostScopeName)) {
                        affectedLanguages.add(Highlighter.scopeNameToLanguageId.get(hostScopeName))
                    }
                    injectionList.delete(scopeName)
                }
            })
        } else if (!Array.isArray(injections) || !injections.every((scope) => typeof scope === 'string')) {
            throw new TypeError(`Second argument to 'linkInjections' must be an array of strings (scope names)`)
        } else {
            Highlighter.scopeNameToInjections.forEach((injectionList, hostScopeName) => {
                if (injections.indexOf(hostScopeName) > -1 && injectionList.has(scopeName)) {
                    if (Highlighter.scopeNameToLanguageId.has(hostScopeName)) {
                        affectedLanguages.add(Highlighter.scopeNameToLanguageId.get(hostScopeName))
                    }
                    injectionList.delete(scopeName)
                }
            })
        }
        // Purge existing registry
        Highlighter.registry = null
        return Array.from(affectedLanguages)
    }

    public static async activateLanguage(scopeName: string, languageId: string, load: 'now' | 'asap' | 'defer' = 'defer'): Promise<boolean> {
        if (!Highlighter.scopeNameToRawGrammars.has(scopeName)) {
            throw new Error(`'${scopeName}' doesn't have a grammar registered. Use addGrammar to register grammar for itself and it's dependencies`)
        }

        if (Highlighter.languageIdToScopeName.has(languageId)) {
            throw new Error(`Language with ID '${languageId}' is already bound to '${Highlighter.languageIdToScopeName.get(languageId)}'. Overwrite not allowed`)
        }

        Highlighter.languageIdToScopeName.set(languageId, scopeName)
        Highlighter.scopeNameToLanguageId.set(scopeName, languageId)
        if (load === 'now') {
            await Highlighter.loadLanguage(languageId)
            return true
        }
        if (load === 'asap') {
            await requestIdle()
            await Highlighter.loadLanguage(languageId)
            return true
        }
        return false
    }

    public static loadLanguage(languageId: string): Promise<IGrammar> {
        const scopeName = Highlighter.languageIdToScopeName.get(languageId)
        if (!scopeName || !Highlighter.scopeNameToRawGrammars.has(scopeName)) {
            return null
        }
        if (!Highlighter.registry) {
            Highlighter.initRegistry()
        }
        return Highlighter.registry.loadGrammar(scopeName)
    }

    public static hasLanguageRegistered(languageId: string) {
        return Highlighter.languageIdToScopeName.has(languageId)
    }

    private static scopeNameToInjections: Map<string, Set<string>> = new Map()
    private static scopeNameToRawGrammars: Map<string, IRawGrammarSource> = new Map()
    private static scopeNameToLanguageId: Map<string, string> = new Map()
    private static languageIdToScopeName: Map<string, string> = new Map()
    private static registry: Registry

    private static initRegistry() {
        Highlighter.registry = new Registry({
            async getGrammarDefinition(scopeName: string, dependentScope: string) {
                if (!Highlighter.scopeNameToRawGrammars.has(scopeName)) {
                    throw new Error(`Grammar for scope '${scopeName}' not found.${dependentScope ? ` It is a dependency of ${dependentScope}. ` : ''} Use addGrammar to register one.`)
                }

                let grammar = Highlighter.scopeNameToRawGrammars.get(scopeName)
                if (typeof grammar === 'function') {
                    grammar = grammar(scopeName)
                    Highlighter.scopeNameToRawGrammars.set(scopeName, grammar)
                }

                if (grammar instanceof Promise) {
                    grammar = await grammar
                    Highlighter.scopeNameToRawGrammars.set(scopeName, grammar)
                }

                if (grammar !== null && typeof grammar === 'object') {
                    return {
                        content: grammar as IRawGrammar,
                        format: 'json' as any,
                    }
                }
                return null
            },
            getInjections(scopeName: string): string[] {
                if (Highlighter.scopeNameToInjections.has(scopeName)) {
                    return Array.from(Highlighter.scopeNameToInjections.get(scopeName))
                }
            },
        })
    }

    private rawTheme: ITextmateThemePlus
    private theme: Theme
    private cachedCssText: string

    constructor(theme?: ITextmateThemePlus) {
        if (theme) {
            if (typeof theme.name !== 'string') {
                throw new TypeError(`Theme object must have 'name' property for referencing purposes`)
            }
            this.rawTheme = theme
            this.theme = Theme.createFromRawTheme(theme)
        }
    }

    public get cssText() {
        if (!this.cachedCssText) {
            this.cachedCssText = cssTextFromTmTheme(this.rawTheme)
        }
        return this.cachedCssText
    }

    public async getTokenizer(languageId: string) {
        const grammar = await Highlighter.loadLanguage(languageId)
        return (stream: CodeMirror.StringStream, state: IHighlighterState): string => {
            const { pos, string: str } = stream
            if (pos === 0) {
                const { ruleStack, tokens } = grammar.tokenizeLine(str, state.ruleStack)
                state.tokensCache = tokens.slice()
                state.ruleStack = ruleStack
            }

            const { tokensCache } = state
            const nextToken = tokensCache.shift()
            if (!nextToken) {
                stream.skipToEnd()
                return null
            }
            const { endIndex, scopes } = nextToken
            stream.eatWhile(() => stream.pos < endIndex)

            return this.theme
                ? this.tmScopeToTmThemeToken(scopes)
                : this.tmScopeToCmToken(scopes)
        }
    }

    private tmScopeToCmToken(scopes: string[]): string {
        let i = scopes.length - 1
        let cmToken = null
        do {
            cmToken = tmScopeToCmToken(scopes[i--])
        } while (!cmToken && i >= 0)
        return cmToken
    }

    private tmScopeToTmThemeToken(scopes: string[]): string {
        let i = scopes.length - 1
        let cmToken = null
        do {
            const { foreground, fontStyle } = this.theme.match(scopes[i--])[0]
            if (foreground > 0) {
                cmToken = `tm-${foreground}`
                cmToken = fontStyle === 0
                    ? cmToken
                    : fontStyle === 1
                        ? cmToken + ' em'
                        : fontStyle === 2
                            ? cmToken + ' strong'
                            : cmToken
            }
        } while (!cmToken && i >= 0)
        return cmToken
    }
}

export { Highlighter }
