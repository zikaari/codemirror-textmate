export default `\
function test() {
    const string = 'nice'
    const number = 1243
    const boolean = false
    const templateLiteral = \`noice${12} mate\`
    const func = (a, b) => a + b
}
    
class AwesomeMap extends Map {
    isKeyOfType(key, type) {
        return typeof this.get(key) === type
    }
}
`