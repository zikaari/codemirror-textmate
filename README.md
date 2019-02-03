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

See `./demo/index.ts` for instructions on how to light it up!

## API

This package is written in TypeScript and is published with TS declaration files. Once you install the package
see `node_modules/codemirror-textmate/dist/typings/index.d.ts` for available stuff along with expected data types.

VSCode's intellisense will also pick up the declaration files and guide you nicely with auto-complete and errors.

## License

MIT
