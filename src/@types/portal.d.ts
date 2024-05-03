import { SchemaReqs } from "./model";

declare interface SessionType {
	username:		string
	created: 		number
}

declare interface LogsType {
	coin: 			string
	usd: 			number
	updated:		number
}

declare interface TxType {
	txid: 			String
	chain: 			String
	coin: 			String
	address:		String
	confirms:		number
	confirmed: 		boolean
	input: 			Boolean
	amount: 		Number
	created:		Number
}

declare interface ChartType {
	prev?: 			Array<LogsType>
	date?: 			Array<LogsType>
	week?: 			Array<LogsType>
	month?: 		Array<LogsType>
}

declare interface ServerResponse {
	result?: 		any
	error?: 		number
}

declare interface LoginReqeustType {
	username: 		string
	password: 		string
}

declare interface LoginResponseType {
	token: 			string
	username:		string
	email: 			string
	pinCode?: 		boolean
	presale?: 		boolean
	voucher?: 		boolean
	lastSeen:		number
	created: 		number
}

declare interface RegisterReqeustType {
	username: 		string
	email: 			string
	password: 		string
}

declare interface ResetReqeustType {
	email: 			string
}
declare interface CodeReqeustType {
	address?: 		string
	code: 			string
}

declare interface ChangeReqeustType {
	oldpass:	 	string
	newpass:	 	string
}

declare interface WalletReqeustType {
	chain: 			string
}

declare interface PresaleReqeustType {
	coin: 			string
	quantity: 		string
	target: 		string
}

declare interface NewtxsResponseType {
	balances:		{[coin:string]:{balance:number, locked:number}}
	wallets: 		{[chain:string]:string}
	prices:  		{[coin:string]:number}
	logs: 	 		ChartType
	txs: 	 		TxType[]
}

declare interface AdminQueryType {
	query?: 		string
	page: 			number
	limit: 			number
	count: 			number
	sort?:			TableSortType
}

declare interface AdminCreateType {
	username: 		string
	email: 			string
	password: 		string
}

declare interface AdminUpdateType {
	id:string
	[key:string]:	string|number|boolean
}

declare interface AdminDeleteType {
	id:				string
}

declare interface AdminUserType {
	id: 			string,
	username: 		string,
	email: 			string
	pincode: 		string
	presale: 		string
	voucher: 		string
	status: 		number
	lastSeen:		number
	created:		number
}
declare interface AdminDepositType {
	coin: 			string
	balance:		number
}
declare interface AdminDailyType {
	date: 			number
	value:			number
}
declare interface AdminAddressTotalType {
	chain: 			string
	total:			number
	used:			number
}
declare interface AdminTotalType {
	total: 			number
	used:			number
}

declare interface AdminTxType {
	username:		string
	chain: 			string
	coin: 			string
	address: 		string
	confirms:		number
	confirmed: 		boolean
	input: 			boolean
	amount: 		number
	created:		number
}

declare interface AdminOrderType {
	username: 	string
	coin: 		string
	quantity: 	number
	voucher?:	string
	target: 	string
	amount: 	number
	txid: 		string
	updated: 	number
	created: 	number
}

declare interface AdminDashboardType {
	customer: 		AdminTotalType
	wallet: 		AdminAddressTotalType[]
	daily: 			{ [coin:string]: AdminDailyType[] }
	deposits: 		AdminDepositType[]
	presale: 		AdminTotalType
	voucher: 		AdminTotalType
	chart:			ChartType
	prices:			{[coin:string]:number}
	txs:			AdminTxType[]
	orders:			AdminOrderType[]
}
declare interface AdminVoucherCodeType {
	code: 			string
	amount: 		number
}


declare interface AdminWalletType {
	chain:			string
	address:		string
}

declare interface AdminEmailType {
	to: 			string
	subject: 		string
	template: 		string
}

declare interface AdminCustomerType {
	id: 			string
	username: 		string
	email: 			string
	usd: 			number
	icicb: 			number
	btc: 			number
	eth: 			number
	bnb: 			number
	ltc: 			number
	usdt: 			number
	created: 		number
}
export interface TableSortType {
    [key:string]:boolean
}
declare interface AdminReferralType {
	code: 			string
	count: 			number
	accounts: 		string[]
}

declare interface AdminWalletDetailType {
	id: 		string
	username:	string
	email:		string
	balances:	Array<{ k:string, v:{balance:0, locked:0} }>
	wallets:	Array<{ k:string, v: string }>
}

declare interface AdminUsersResponseType {
	count: 			string
	data: 			AdminCustomerType[]
}