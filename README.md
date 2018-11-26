# Textmate grammars support for CodeMirror

Bring TM grammar driven tokenization to your CodeMirror editors.

Say goodbye to the not-so-cool and not-so-accurate syntax highlighting you've been living with and up your game with ease!

### WARNING

This package will only work in browsers with `WebAssembly` support. Here's a recommended way to deal with it:

```javascript
// 95% of your target audience (developers)
if ('WebAssembly' in window) {
    const [{
            loadWASM
        },
        {
            activateLanguage,
            addGrammar
        }
    ] = await Promise.all([
        import('onigasm'),
        import('codemirror-textmate'),
    ])

    // ... (see https://www.npmjs.com/package/onigasm#light-it-up)
    // ... (see example code below)
}
// Fallback for rest 5%
else {
    await Promise.all([
        import('codemirror/mode/javascript/javascript'),
        import( 'codemirror/mode/htmlmixed/htmlmixed'),
    ])
}

const editor = CodeMirror.fromTextArea( /* ... */ )
// ... (go on as usual)
```

## Usage

### Install

```bash
$ npm i codemirror-textmate

# Install peer dependencies if you haven't already
npm i onigasm codemirror 
```

### Light it up

> Example code below assumes that `onigasm` is loaded and ready to go before it itself is executed. [See here for instructions on setting up `onigasm`](https://www.npmjs.com/package/onigasm#light-it-up).

```javascript
import CodeMirror from 'codemirror'
import {
    activateLanguage,
    addGrammar,

    // [ optional | recommended ] Textmate themes in CodeMirror
    addTheme,
    // [ optional ] Grammar injections
    linkInjections
} from 'codemirror-textmate'

async function run() {
    const grammars = {
        // loading `source.js` as a standalone grammar and as dependency of `text.html.basic` 
        'source.js': {
            /**
             * We'll be using `fetch()` to load grammars, and for that, we'll resolve to URI by prepending the path below with
             * 'public/grammars/' in `loadGrammar` function below
             */
            path: 'Javascript.tmLanguage.json',

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
            load: 'now'
        },

        // loading `source.css` as a standalone grammar and as dependency of `text.html.basic` 
        'source.css': {
            path: 'Css.tmLanguage.json',
            language: 'css',
            load: 'now'
        },

        // Secondary dependency of `text.html.basic`
        'source.smarty': {
            path: 'Smarty.tmLanguage.json',
        },
        // Secondary dependency of `text.html.basic`
        'source.python': {
            path: 'Python.tmLanguage.json',
        },

        // Some grammars have other grammars as dependencies. You must register those deps with `addGrammar` or it will throw an Error
        'text.html.basic': {
            path: 'Html.tmLanguage.json',
            language: 'html',
            load: 'asap',
        }

    }

    const loadGrammar = (scopeName) => {
        if (grammars[scopeName]) {
            const { path } = grammars[scopeName]
            return (await fetch(`public/grammars/${path}`)).json()
        }
    }

    // To avoid FOUC, await for high priority languages to get ready (loading/compiling takes time, and it's an async process for which CM won't wait)
    await Promise.all(Object.keys(grammars).map(async scopeName => {
        const { path, language, load } = grammars[scopeName]

        /* EITHER
         * addGrammar(scopeName, loadGrammar)
         * OR (VERY ineffcient)
         * addGrammar(scopeName, async () => (await fetch(`public/grammars/${path}`)).json())
         */
        addGrammar(scopeName, loadGrammar)

        if (language) {
            const prom = activateLanguage(scopeName, language, load)
            
            // We must "wait" for high priority languages to load/compile before we render editor to avoid FOUC (Flash of Unstyled Content)
            if(load === 'now') {
                await prom
            }

            // 'asap' although "awaitable", is a medium priority, and doesn't need to be waited for
            // 'defer' doesn't support awaiting at all
            return
        }
    }))

    const editor = CodeMirror.fromTextArea(document.getElementById('cm-textarea'), {
        lineNumbers: true,
        // If you know in advance a language is going to be set on CodeMirror editor and it isn't preloaded by setting the third argument 
        // to `activateLanguage` to 'now', the contents of the editor would start of and remain as unhighlighted text, until loading is complete
        mode: 'javascript',
    })

    // Everything should be working now!

    //////////////////////////////////////////////////////

    //    ____        __  _                   __
    //   / __ \____  / /_(_)___  ____  ____ _/ /
    //  / / / / __ \/ __/ / __ \/ __ \/ __ `/ / 
    // / /_/ / /_/ / /_/ / /_/ / / / / /_/ / /  
    // \____/ .___/\__/_/\____/_/ /_/\__,_/_/   
    //     /_/                                  
    
    // Using Textmate theme in CodeMirror
    const theme = await (await fetch('Monokai.tmTheme.json')).json()
    addTheme(theme)
    editor.setOption('theme', 'Monokai')

    // Grammar injections, example code below will highlight css-in-js (styled-components, emotion)
    addGrammar('source.css.styled', async () => (await fetch('public/grammars/css.styled.tmLanguage.json')).json())
    addGrammar('styled', async () => (await fetch('public/grammars/styled.tmLanguage.json')).json())
    const affectedLanguages = await linkInjections('styled', ['source.ts', 'source.tsx', 'source.js', 'source.jsx'])

    // You must re-trigger tokenization to apply the update above (if applicable)
    const activeMode = editor.getOption('mode')
    if (affectedLanguages.indexOf(activeMode) > -1) {
        // Resetting cm's mode re-triggers tokenization of entire document
        editor.setOption('mode', activeMode)
    }
}

```

## API

I strogly believe that the example above covers just about everything this package supports and everything you'll ever need!
This package is written in TypeScript and is published with TS declaration files. Once you install the package
see `node_modules/codemirror-textmate/dist/typings/index.d.ts` for available stuff along with expected data types.

## License

MIT
