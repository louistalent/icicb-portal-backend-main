import { ObjectId } from "mongodb";

declare interface SchemaBlocks {
	_id: 	ObjectId
	chain: 	string
	height: number
}
declare interface SchemaEvents {
	_id: 	ObjectId
	txid: 		string
	blocknumber:number
	address:	string
	token:		string|null
	chain:		number
	targetchain:number
	value:		string
	fee?:		string
	sendvalue?:	string
	sendtx?:	string
	err?:		number
	updated:	number
	created:	number
}
declare interface SchemaIcicb {
	price: number
	updated: number
}
declare interface SchemaPrices {
	_id: ObjectId
	coin: string
	usd: number
	updated: number
}

declare interface SchemaAddrs {
	_id: ObjectId
	chain: string
	address: string
	uid?:	 ObjectId
	updated: number
	created: number
}

declare interface IPLocationType {
	ip:			string
	continent: 	string
	country:	string
	region: 	string
	regionName: string
	city: 		string
	timezone: 	string
	currency: 	string
	mobile: 	boolean
	proxy: 		boolean
	hosting: 	boolean
}

declare interface SchemaUsers {
	_id: 				ObjectId
	username: 			string
	email: 				string
	password: 			string
	pincode: 			string
	referral: 			string
	presale: 			string
	voucher: 			string
	status: 			number
	location:			IPLocationType
	balances: {
		[coin:string]:{
			balance: 	number
			locked:	 	number
		}
	}
	wallets: {
		[chain:string]:	string
	}
	lastSeen:			number
	updated:			number
	created:			number
}

declare interface SchemaReferral {
	_id:		 		ObjectId
	code:				string
	accounts:			string[]
	updated:			number
	created:			number
}

declare interface SchemaPresale {
	_id: 	ObjectId
	code:	string
	uid?:	ObjectId
	updated:number
	created:number
}

declare interface SchemaVoucher {
	_id: 	ObjectId
	code:	string
	amount:	number
	uid?:	ObjectId
	updated:number
	created:number
}

declare interface SchemaTxs {
	_id: 	ObjectId
	chain: 	string
	address:string
	txid: 	string
	height: number
	confirmations: number
	confirmed: boolean
	vout: 	number
	coin: 	string
	amount: number
	created:number
}

declare interface SchemaLogs {
	_id: ObjectId
	coin: string
	usd: number
	updated: number
}

declare interface SchemaReqs {
	_id: 		ObjectId
	uid: 		ObjectId
	voucher?: 	string
	coin: 		string
	quantity: 	number
	target: 	string
	amount: 	number
	txid: 		string
	updated: 	number
	created: 	number
}
declare interface SchemaAdmins {
	_id: 		ObjectId
	username: 	string
	email:    	string
	password: 	string
	status:   	number
	lastSeen: 	number
	updated:  	number
	created:  	number
}

declare interface SchemaFaucets {
	_id: 		ObjectId
	ip: 		string
	git:    	string
	address: 	string
	count:   	number
	updated:  	number
	created:  	number
}
declare interface SchemaFaucetsReqs {
	_id: 		ObjectId
	uid: 		ObjectId
	chain:   	string
	address: 	string
	amount:  	number
	txid?:  	string
	updated:  	number
	created:  	number
}