declare interface AbiEntry {
	inputs: Array<{
		internalType: string
		name: string
		type: string
	}>
	name: string
	outputs: Array<{
		internalType: string
		name: string
		type: string
	}>
	stateMutability: string
	type: string
}

declare interface TokenType {
    [token:string]:	{
        coin: string
        decimals: number
    }
}