declare interface TX {
	address:    	string
	txid: 	    	string
	height:     	number
	confirmations:  number
	vout?: 	   		number
	rbf?: 	    	boolean
	coin: 	    	string
	amount:     	string
	spenttx?:    	string
	error?:    		boolean
	created:    	number
}

declare interface ChainApiDepositReqeustType {
    chain:string
    txs: TX[]
}

