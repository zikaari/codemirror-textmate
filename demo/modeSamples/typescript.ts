export default `\
interface IEatable {
    chew(speed?: number): Promise<boolean>
    swallow(ensureChewed?: boolean): Promise<boolean>
}

function test() {
    const string: string = 'nice'
    const number: number = 1243
    const boolean: boolean = false
    const templateLiteral: string = \`noice ${'${12}'} mate\`
    const func = (a: number, b: number) => a + b
}
    
class AwesomeMap<K, V> extends Map<K, V> {
    public isKeyOfType(key: string, type: string) {
        return typeof this.get(key) === type
    }
}
`