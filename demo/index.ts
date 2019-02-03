import * as CodeMirror from 'codemirror'
import { loadWASM } from 'onigasm'

import 'codemirror/lib/codemirror.css'

import {
    activateLanguage,
    addGrammar,

    // [ optional | recommended ] Textmate themes in CodeMirror
    addTheme,
    ITextmateThemePlus,
    // [ optional ] Grammar injections
    linkInjections,
} from 'codemirror-textmate'

(async () => {
    await loadWASM(
        // webpack has been configured to resolve `.wasm` files to actual 'paths" as opposed to using the built-in wasm-loader
        // oniguruma is a low-level library and stock wasm-loader isn't equipped with advanced low-level API's to interact with libonig
        require('onigasm/lib/onigasm.wasm'))

    const grammars = {
        // loading `source.js` as a standalone grammar and as dependency of `text.html.basic` 
        'source.js': {
            /**
             * This the most resource efficient way to load grammars as of yet
             */
            loader: () => import('./tm/grammars/Javascript.tmLanguage.json'),

            /**
             * Language ID is only necessary for languages you want to use as CodeMirror mode (eg: cm.setOption('mode', 'javascript'))
             * To do that, we use `activatelanguage`, which will link one scope name to a language ID (also known as "mode")
             * 
             * Grammar dependencies don't need to be "activated", just "adding/registering" them is enough (using `addGrammar`)
             */
            language: 'javascript',

            /**
             * Third parameter accepted by `activateLanguage` to specify language loading priority
             * Loading priority can be 'now' | 'asap' | 'defer' (default)
             * 
             *  - [HIGH] 'now' will cause the language (and it's grammars) to load/compile right away (most likely in the next event loop)
             *  - [MED]  'asap' is like 'now' but will use `requestIdleCallback` if available (fallbacks to `setTimeout`, 10 seconds).
             *  - [LOW]  'defer' will only do registeration and loading/compiling is deferred until needed (⚠ WILL CAUSE FOUC IN CODEMIRROR) (DEFAULT)
             */
            priority: 'now'
        },

        // loading `source.css` as a standalone grammar and as dependency of `text.html.basic` 
        'source.ts': {
            loader: () => import('./tm/grammars/TypeScript.tmLanguage.json'),
            language: 'typescript',
            priority: 'asap'
        },

        // loading `source.css` as a standalone grammar and as dependency of `text.html.basic` 
        'source.css': {
            loader: () => import('./tm/grammars/css.tmLanguage.json'),
            language: 'css',
            priority: 'now'
        },

        // Secondary dependency of `text.html.basic`
        'source.smarty': {
            loader: () => import('./tm/grammars/smarty.tmLanguage.json'),
            // priority of dependenices like this one are regulated by dependent grammars
        },
        // Secondary dependency of `text.html.basic`
        // (can be also be used for tokenizing python source code, just add `language` property below)
        'source.python': {
            loader: () => import('./tm/grammars/python.tmLanguage.json'),
        },

        // Some grammars have other grammars as dependencies. You must register those deps with `addGrammar` or it will throw an Error
        'text.html.basic': {
            loader: () => import('./tm/grammars/html.tmLanguage.json'),
            language: 'html',
            priority: 'asap',
        }

    }

    // To avoid FOUC, await for high priority languages to get ready (loading/compiling takes time, and it's an async process for which CM won't wait)
    await Promise.all(Object.keys(grammars).map(async scopeName => {
        const { loader, language, priority } = grammars[scopeName]

        addGrammar(scopeName, loader)

        if (language) {
            const prom = activateLanguage(scopeName, language, priority)

            // We must "wait" for high priority languages to load/compile before we render editor to avoid FOUC (Flash of Unstyled Content)
            if (priority === 'now') {
                await prom
            }

            // 'asap' although "awaitable", is a medium priority, and doesn't need to be waited for
            // 'defer' doesn't support awaiting at all
            return
        }
    }))

    const editor = CodeMirror.fromTextArea(document.getElementById('cm-host') as HTMLTextAreaElement, {
        lineNumbers: true,
        // If you know in advance a language is going to be set on CodeMirror editor and it isn't preloaded by setting the third argument 
        // to `activateLanguage` to 'now', the contents of the editor would start of and remain as unhighlighted text, until loading is complete
        mode: 'typescript'
    })
    editor.setValue((await import('./modeSamples/typescript')).default)

    // Everything should be working now!

    //////////////////////////////////////////////////////

    //    ____        __  _                   __
    //   / __ \____  / /_(_)___  ____  ____ _/ /
    //  / / / / __ \/ __/ / __ \/ __ \/ __ `/ / 
    // / /_/ / /_/ / /_/ / /_/ / / / / /_/ / /  
    // \____/ .___/\__/_/\____/_/ /_/\__,_/_/   
    //     /_/                                  

    // Using Textmate theme in CodeMirror
    const themeX: ITextmateThemePlus = {
        ...(await import('./tm/themes/OneDark.tmTheme.json')),
        gutterSettings: {
            background: '#1d1f25',
            divider: '#1d1f25'
        }
    }
    addTheme(themeX)
    editor.setOption('theme', themeX.name)

    // Grammar injections, example code below will highlight css-in-js (styled-components, emotion)
    // injections are "injections", they are not standalone-grammars, therefore no `activateLanguage`
    addGrammar('source.css.styled', () => import('./tm/grammars/css.styled.tmLanguage.json') as any)
    addGrammar('styled', () => import('./tm/grammars/styled.tmLanguage.json') as any)

    const affectedLanguages = await linkInjections('styled', ['source.ts', 'source.tsx', 'source.js', 'source.jsx'])

    // You must re-trigger tokenization to apply the update above (if applicable)
    const activeMode = editor.getOption('mode')
    if (affectedLanguages.indexOf(activeMode) > -1) {
        // Resetting cm's mode re-triggers tokenization of entire document
        editor.setOption('mode', activeMode)
    }
})()
