require("dotenv").config()
import * as express from 'express'
import axios from 'axios'
import { getNewId, getObjectId, Admins, Users, Presale, Voucher, Addrs, Blocks, Events, Txs, Prices, Logs, Reqs, Faucets, FaucetReqs, Referral, Icicb } from './Model'
import { hmac256, setlog, validateEmail, validateUsername, generatePassword, generateCode } from './helper'
import { getSession, setSession } from './Redis'
import sendMail from './Email'
import * as Coins from './config/coins.json'
import * as Countries from './config/country-en.json'
import { AnyBulkWriteOperation, Filter, ObjectId, WithId } from 'mongodb'
import * as BridgeAbi from './config/abis/Bridge.json'
import * as geoip from 'geoip-lite'
import { AdminAddressTotalType, AdminDepositType, AdminCustomerType, AdminDailyType, AdminDashboardType, AdminDeleteType, AdminEmailType, AdminOrderType, AdminQueryType, AdminReferralType, AdminTotalType, AdminTxType, AdminUpdateType, AdminUsersResponseType, AdminVoucherCodeType, AdminWalletDetailType, AdminWalletType, ChangeReqeustType, ChartType, CodeReqeustType, LoginReqeustType, LoginResponseType, LogsType, NewtxsResponseType, PresaleReqeustType, RegisterReqeustType, ResetReqeustType, ServerResponse, SessionType, TxType, WalletReqeustType } from './@types/portal'
import { IPLocationType, SchemaEvents, SchemaReferral, SchemaReqs, SchemaTxs, SchemaUsers } from './@types/model'
import { ObjectID } from 'bson'
import { isValidCode } from './crc32'

const colors = require('colors')
const Web3 = require('web3')
const bridgeAbi = BridgeAbi as any
const coins = Coins as {[chain:string]:{[coin:string]:{address:string, symbol:string, decimals:number}}}
const countries = Countries as {[code:string]:string}
const privKey = process.env.PRIVATE_KEY || ''
const chainApiUrl = process.env.CHAINAPI_URL || ''
const chainApiKey = process.env.CHAINAPI_KEY || ''

const githubClientId = process.env.GITHUB_CLIENT_ID || ''
const githubSecretKey = process.env.GITHUB_CLIENT_SECRET || ''
const recaptchaKey = process.env.GOOGLE_RECATCHA_KEY || ''
const recaptchaSecret = process.env.GOOGLE_RECATCHA_SECRET || ''
const MIN_GITOLD = 30 // date
const FAUCET_AMOUNT = 10 // date

const utils = new Web3().utils
const toHex = (val: string | number): string => utils.toHex(val)
const NULLADDRESS = '0x0000000000000000000000000000000000000000'
const N = (v:number,p:number=6) => Math.round(v * 10 ** p) / 10 ** p

const evmChains = ['eth', 'bsc']

const ChainSeq = {
	evm: 1,
	btc: 2,
	ltc: 3,
} as {[key:string]:number}
const CoinSeq = {
	icicb: 0,
	usdt: 1,
	btc: 2,
	eth: 3,
	bnb: 4,
	ltc: 5
} as {[key:string]:number}

const logCache = {} as {
	updated: number
	chart: ChartType
}

const chains = require('../chains.json') as {
	[chain:string]: {
        evm?: 			boolean
		bridge?: 		string
        wicicb?: 		string
        chainId?: 		number
        coin: 			string
        decimals: 		number
        confirmations: 	number
        blocktime: 		number
        rpc: 			string
        explorer: 		string
        erc20?: 		string
	}
}
const chainByIds = {} as { [chainId:number]:string }
for (let i in chains) {
	const chainId = chains[i].chainId
	if ( chainId && chains[i].bridge ) {
		chainByIds[chainId] = i
	}
}

const coinByAddress = {} as {[chainId:number]:TokenType}
for (let i in chainByIds) {
	if (coinByAddress[i]===undefined) coinByAddress[i] = {}
	const c = coins[chainByIds[i]]
	if (c) {
		for(let coin in c) {
			coinByAddress[i][c[coin].address] = {coin, decimals: c[coin].decimals}
		}
	}
}

const secret = process.env.APP_SECRET || ''
const router = express.Router()

const now = () => Math.round(new Date().getTime()/1000)

const prices:{[coin:string]:number} = {
	icicb: 0.04,
	eth: 0,
	usdt: 1,
	btc: 0,
	bnb: 0,
	ltc: 0,
}

export const initApp = async () => {
	setlog("started cron prices")
	const cronPrices = async () => {
		await checkPrices()
		setTimeout(cronPrices, 60000)
	}

	cronPrices()
	cronChain('icicb')
	cronChain('eth')
	cronChain('bsc')
	// check and add admin
	try {
		let count = await Admins.count()
		if (count===0) {
			await Admins.insertOne({
				_id: 		getNewId(),
				username: 	"support",
				email:    	"support@icicb.com",
				password: 	hmac256("123456", secret),
				status:   	1,
				lastSeen: 	0,
				updated:  	0,
				created:  	now()
			})
		}
	} catch (error) {
		
	}
}

const callChainApi = async (url:string, json?:any, headers?:{[key:string]:string}):Promise<any>=>{
	try {
		const response = await (json ? axios.post(chainApiUrl + url, json, {timeout: 60000, headers: {'Content-Type': 'application/json', ...headers}}) : axios.get(url))
		if (response!==null && response.data) {
			if (response.data.result!==undefined) return true
			if (response.data) return response.data
		}
	} catch (error) {
		setlog(url, error)
	}
	return false
}

const getIcicbPrice = async ():Promise<number> => {
	const icicb = await Icicb.findOne()
	if (icicb) return icicb.price
	return 0.3
}

const checkPrices = async ():Promise<void> => {
	const pairs:{[key:string]:string} = {
		btc: 'BTCUSDT',
		eth: 'ETHUSDT',
		ltc: 'LTCUSDT',
		/* bch: 'BCHUSDT', */
		/* zec: 'ZECUSDT', */
		/* doge:'DOGEUSDT',
		xrp: 'XRPUSDT', */
		bnb: 'BNBUSDT',
		/* usdc: 'USDCUSDT', */
		/* dot: 'DOTUSDT',
		eos: 'EOSUSDT', */
		/* link: 'LINKUSDT', */
	}
	
	try {
		const updated = Math.round(new Date().getTime() / 1000)
		for(let coin in pairs) {
			const result:any = await axios('https://api.binance.com/api/v3/ticker/price?symbol='+pairs[coin])
			if (result!==null && result.data && result.data.price) {
				const usd = Number(result.data.price)
				if (prices[coin]!==undefined) {
					prices[coin] = usd
					await Prices.updateOne({coin}, {$set:{usd,updated}}, {upsert: true})
					let time = updated - (updated % 14400)
					await Logs.updateOne({coin, updated:time}, {$set:{usd, updated:time}}, {upsert: true})
				}
			}
			await new Promise(resolve=>setTimeout(resolve,500))
		}
		const icicb = await getIcicbPrice()
		prices['icicb'] = icicb
		await Prices.updateOne({coin:'icicb'}, {$set:{usd:icicb,updated}}, {upsert: true})
		let time = updated - (updated % 14400)
		await Logs.updateOne({coin:'icicb', updated:time}, {$set:{usd:icicb, updated:time}}, {upsert: true})
	} catch (error) {
		setlog('checkPrices', error)
	}
}


const getIpLocation = async (ip:string):Promise<IPLocationType> => {
	/* const mockup = [
		'159.89.44.28',
		'110.152.65.183',
		'36.99.93.54',
		'117.136.75.37',
		'36.99.93.54',
		'113.57.244.141',
		'183.95.213.123'
	]
	let idx = Math.round(Math.random()*mockup.length)
	if (idx>=mockup.length) idx = mockup.length - 1
	ip = mockup[idx] */

	const result = {ip} as IPLocationType
	if (ip!=='127.0.0.1') {
		// https://ip-api.com/docs/api:json
		/* const url = 'http://ip-api.com/json/' + ip + '?fields=27476254' */
		/* const r1 = await fetch(url)
		const data = await r1.json() */
		const response = await callChainApi('http://ip-api.com/json/' + ip + '?fields=27476254')
		/* {
			"status": "success",
			"continentCode": "EU",
			"countryCode": "RU",
			"region": "KHA",
			"regionName": "Khabarovsk",
			"city": "Khabarovsk",
			"timezone": "Asia/Vladivostok",
			"currency": "RUB",
			"mobile": false,
			"proxy": false,
			"hosting": false
		} */
		if (response && response.status==='success') {
			result.continent	= response.continentCode
			result.country		= response.countryCode
			result.region		= response.region
			result.regionName	= response.regionName
			result.city			= response.city
			result.timezone		= response.timezone
			result.currency		= response.currency
			result.mobile		= response.mobile
			result.proxy		= response.proxy
			result.hosting		= response.hosting
		} else {
			const geo = geoip.lookup(ip)
			if (geo) {
				result.country	= geo.country
				result.region	= geo.region
				result.city		= geo.city
				result.timezone	= geo.timezone
			}
		}
	}
	return result
}

const serverResponse = async (req:express.Request, res:express.Response, cb:(session:SessionType|null, isAdmin?:boolean)=>Promise<ServerResponse>) => {
	try {
		let isAdmin = false
		let token = req.headers["x-token"] || ''
		if (token==='') {
			token = req.headers["x-admin-token"] || ''
			if (token!=='') isAdmin = true
		}
		let session:SessionType|null = null
		if (token) session = await getSession(token as string)
		res.json(await cb(session, isAdmin))
	} catch (error:any) {
		setlog('serverResponse', error)
		if (error.code===11000) {
			res.json({error:1007})
		} else {
			res.json({error:-32000})
		}
	}
}

router.post("/chainapi/deposit", async (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null)=>{
		const { chain, txs } = req.body as ChainApiDepositReqeustType
		for(let i of txs) {
			if (!chains[chain]) {
				setlog('/chainapi/deposit', `invalid chain name [${chain}]`)
				continue
			}
			if (i.spenttx) {
				setlog('/chainapi/deposit', `transfer transaction [${chain}], ignored`)
				continue
			}
			const confirmed = i.confirmations >= chains[chain].confirmations
			const decimals = i.coin===chains[chain].coin ? chains[chain].decimals : coins[chain][i.coin].decimals
			const amount = Number(BigInt(i.amount) / BigInt(10 ** (decimals - 6))) / 1e6
			
			if (i.error) {
				await Txs.deleteOne({chain, address:i.address, txid:i.txid})
			} else {
				const row = await Txs.findOne({chain, address:i.address, txid:i.txid})
				let $set:any = null
				if (row) {
					$set = {confirmations: i.confirmations}
					if (!row.confirmed &&  confirmed) {
						$set.confirmed = true
					}
					await Txs.updateOne({_id: row._id},{$set})
				} else {
					$set = {
						_id: 	getNewId(),
						chain,
						address:i.address,
						txid: 	i.txid,
						height: i.height,
						confirmations: i.confirmations,
						vout: 	i.vout || 0,
						coin: 	i.coin,
						amount,
						created:i.created
					}
					if (confirmed) {
						$set.confirmed = true
					}
					await Txs.insertOne($set)
				}
				if ($set.confirmed) {
					const chainName = chains[chain].evm ? 'evm' : chain
					const filter = {['wallets.' + chainName]:i.address} as any
					const user = await Users.findOne(filter) as any
					if (user) {
						if (user.balances[i.coin]===undefined) {
							await Users.updateOne({_id:user._id}, {$set:{["balances."+i.coin]:{balance:amount, locked:0}}})
						} else {
							const balance = Number((user.balances[i.coin].balance + amount).toFixed(6))
							await Users.updateOne({_id:user._id}, {$set:{["balances."+i.coin+'.balance']:balance}})
						}
					} else {
						setlog('/chainapi/deposit', `undefined user by address [${i.address}]`)
					}
				}
			}
		}
		return {result:true}
	})
})

router.post("/portal/login", (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null)=>{
		if (session!==null) {
			return {error:1008}
		} else {
			const { username, password } = req.body as LoginReqeustType
			if (validateEmail(username)===false && validateUsername(username)===false) return {error:1001}
			if (password.length!==64) return {error:1003}
			const regex = new RegExp(username, "i")
			const row = await Users.findOne({$or:[{username:regex}, {email:regex}]})
			if (!row) return {error:1004}
			if (Number(row.status)===0) return {error:1005}
			if (password!==row.password) return {error:1006}
			const created = now()
			const token = hmac256([row.username, created].join('-'), secret)
			await setSession(token, {username:row.username, created})
			const result:LoginResponseType = {
				token,
				username: row.username,
				email: row.email,
				pinCode: !!row.pincode,
				presale: true,//!!row.presale || !!row.referral,
				voucher: !!row.voucher,
				lastSeen: row.lastSeen,
				created: row.created
			}
			return {result}
		}
	})
})

router.post("/portal/register", (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null)=>{
		if (session!==null) {
			return {error:1008}
		} else {
			const {username, email, password} = req.body as RegisterReqeustType
			if (validateUsername(username)===false) return {error:1001}
			if (validateEmail(email)===false) return {error:1002}
			if (password.length!==64) return {error:1003}
			const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress)
			const location = await getIpLocation(ip)
			const created = now()
			const _id = getNewId()
			await Users.insertOne({
				_id,
				username,
				email,
				password,
				pincode: '',
				referral: '',
				presale: 'a',
				voucher: '',
				location,
				status: 1,
				balances: {},
				wallets: {},
				lastSeen:0,
				updated: 0,
				created
			})
			// sendMail(email, "Welcome to join ICICBChain community", "register-success", {})
			return {result:true}
		}
	})
})

router.post("/portal/reset-password",async (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null)=>{
		const { email } = req.body as ResetReqeustType
		if (validateEmail(email)===false) return {error:1002}
		const row = await Users.findOne({email})
		if (!row) return {error:1004}
		if (row.status===0) return {error:1005}
		const password = generatePassword()
		await Users.updateOne({email}, {$set:{password:hmac256(password, secret)}})
		const result = await sendMail(email, "Reset password for ICICB portal", "reset-password", {
			password,
			name: row.username
		})
		return {result}
	})
})

router.post("/portal/set-pincode",async (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null)=>{
		if (session!==null) {
			const { code } = req.body as CodeReqeustType
			if (!/\d{6}/.test(code)) return {error:1007}
			const row = await Users.findOne({username:session.username})
			if (!row) return {error:1004}
			if (row.status===0) return {error:1005}
			await Users.updateOne({username:session.username}, {$set:{pincode:code}})
			/* const result = await sendMail(row.email, "Setup pincode for ICICB portal", "setup-pincode", {website:"icicb", code}) */
			return {result:true}
		} else {
			return {error:2000}
		}
	})
})

router.post("/portal/change-password",async (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null)=>{
		if (session!==null) {
			const { oldpass, newpass } = req.body as ChangeReqeustType
			const user = await Users.findOne({username:session.username})
			if (!user) return {error:1004}
			if (user.status===0) return {error:1005}
			if (oldpass!==user.password) return {error:1006}
			if (newpass.length!==64) return {error:1003}
			await Users.updateOne({username:session.username}, {$set:{password:newpass}})
			return {result:true}
		} else {
			return {error:2000}
		}
	})
})

router.post("/portal/get-user-wallet",async (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null)=>{
		if (session!==null) {
			let { chain } = req.body as WalletReqeustType
			const user = await Users.findOne({username:session.username})
			if (!user) return {error:1004}
			if (user.status===0) return {error:1005}
			if (chain!=='evm') {
				if (chains?.[chain]===undefined)  return  {error:2009}
				if (user.wallets?.[chain]!==undefined) return  {error:2007}
				if (!!chains[chain].evm) chain = 'evm'
			}
			const row = await Addrs.findOne({chain, uid:{$exists:false}})
			if (row) {
				const address = row.address
				const result = await callChainApi("/add-address", { data:[{chain, address}] }, { 'x-token': chainApiKey })
				if (result) {
					await Addrs.updateOne({_id:row._id}, {$set:{uid:user._id, updated:now()}})
					await Users.updateOne({_id:user._id}, {$set:{wallets:{...user.wallets, [chain]:address}}})
					return {result:{address}}
				} else {
					return {error:-32001}
				}
			} else {
				return {error:2010}
			}
		} else {
			return {error:2000}
		}
	})
})

router.post("/portal/set-presale-code",async (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null)=>{
		if (session!==null) {
			const { code } = req.body as CodeReqeustType
			const user = await Users.findOne({username:session.username})
			if (!user) return {error:1004}
			if (user.status===0) return {error:1005}
			if (user.presale) return {error:2004} 
			const rowRef = await Referral.findOne({code})
			if (rowRef) {
				await Referral.updateOne({_id:rowRef._id}, {$push:{accounts:user.email}})
				await Users.updateOne({_id:user._id}, {$set:{referral:rowRef.code}})
				return { result:true }
			}
			let row = await Presale.findOne({code})
			if (row) {
				if (row.uid) return {error:2006}
				await Presale.updateOne({_id:row._id}, {$set:{uid:user._id}})
				await Users.updateOne({_id:user._id}, {$set:{presale:row.code}})
				return { result:true }
			}
			return {error:2005}
		} else {
			return {error:2000}
		}
	})
})

router.post("/portal/set-voucher",async (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null)=>{
		if (session!==null) {
			const { code } = req.body as CodeReqeustType
			const user = await Users.findOne({username:session.username})
			if (!user) return {error:1004}
			if (user.status===0) return {error:1005}
			/* if (user.voucher) return {error:2004} */
			
			const row = await Voucher.findOne({code})
			if (row) {
				if (row.uid) return {error:2006}
				const _id = getNewId()
				await Reqs.insertOne({
					_id,
					uid: user._id,
					voucher:code,
					coin: '',
					quantity: 0,
					target: 'icicb',
					amount: row.amount,
					txid: '',
					updated: 0,
					created:now(),
				})
				const balance = user.balances.icicb ? user.balances.icicb.balance : 0
				const locked = (user.balances.icicb ? user.balances.icicb.locked : 0) + row.amount
				/* const result = await sendMail(user.email, "Request ICICB Presale", "request-presale", {coin, quantity, target}) */
				await Users.updateOne({_id:user._id}, {$set:{voucher:row.code, balances:{...user.balances, icicb: {balance, locked}}}})
				await Voucher.updateOne({_id:row._id}, {$set:{uid:user._id}})
				return {result:true}
			}
			return {error:2005}
		} else {
			return {error:2000}
		}
	})
})

router.post("/portal/presale",async (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null)=>{
		if (session!==null) {
			const { coin, quantity, target } = req.body as PresaleReqeustType
			const user = await Users.findOne({username:session.username})
			if (user===null) return {error:1004}
			if (user.status===0) return {error:1005}
			if (prices[coin] === undefined || prices[target] === undefined) return {error:2002}
			const amount = Number(quantity)
			if (isNaN(amount)) return {error:2008}
			if ((user.balances[coin]?.balance || 0) < amount) return {error:2003}
			const resultAmount = N(amount * prices[coin] / prices[target])
			user.balances[coin].balance = N(user.balances[coin].balance - amount)
			if (user.balances[target]===undefined) user.balances[target] = {balance:0, locked:0}
			user.balances[target].locked = N(user.balances[target].locked + resultAmount)
			const created = now()
			await Users.updateOne({username:session.username}, {$set:{balances:user.balances, updated:created}})
			const _id = getNewId()
			await Reqs.insertOne({
				_id,
				uid: user._id,
				coin,
				quantity: amount,
				target,
				amount: resultAmount,
				txid: '',
				updated: 0,
				created,
			})
			/* await data.save() */
			// const result = await sendMail(user.email, "Request ICICB Presale", "request-presale", {name:user.username, coin, quantity, target})
			return {result:true}
		} else {
			return {error:2000}	
		}
	})
})

const get_portal_chart = async () => {
	let result = {} as ChartType
	const currentTime = now()
	if (currentTime - (logCache.updated || 0) >=14400) {
		const prev =  [] as LogsType[]
		const date =  [] as LogsType[]
		const week =  [] as LogsType[]
		const month = [] as LogsType[]
		
		const weekDiff = 86400
		const monDiff = 86400 * 5
		const startFrom = currentTime - currentTime % 14400

		const rows = await Logs.find({updated: {$gt: currentTime - 2678400}}).sort( { coin: 1, updated:1 } ).toArray()
		let w = {} as {[coin:string]:{s:number, c:number, t:number}}
		let m = {} as {[coin:string]:{s:number, c:number, t:number}}
		for(let i of rows) {
			const c = i.coin
			if (i.updated >= startFrom-86400 * 2 && i.updated < startFrom-86400) {
				prev.push({ coin: c, usd: i.usd, updated: i.updated })
			} if (i.updated >= startFrom-86400) {
				date.push({ coin: c, usd: i.usd, updated: i.updated })
			}
			if (i.updated >= startFrom - 604800) {
				w[c] ??= {s:0, c:0, t:0}
				if (i.updated - w[c].t >= weekDiff && w[c].t) {
					if (w[c].c) week.push({ coin: c, usd: N(w[c].s / w[c].c, 2), updated: i.updated })
					w[c].s = 0
					w[c].c = 0
					w[c].t = 0
				} else {
					w[c].s += i.usd
					w[c].c ++
					if (w[c].t===0) w[c].t = i.updated
				}
			}
			
			if (i.updated >= startFrom - 2678400) {
				m[c] ??= {s:0, c:0, t:0}
				if (i.updated - m[c].t >= monDiff && m[c].t) {
					if (m[c].c) month.push({ coin: c, usd: N(m[c].s / m[c].c, 2), updated: i.updated })
					m[c].s = 0
					m[c].c = 0
					m[c].t = 0
				} else {
					m[c].s += i.usd
					m[c].c ++
					if (m[c].t===0) m[c].t = i.updated
				}
			}
			
		}
		for(let c in w) {
			if (w[c] && w[c].c) week.push({ coin: c, usd: N(w[c].s / w[c].c, 2), updated: w[c].t })
		}
		for(let c in m) {
			if (m[c] && m[c].c) month.push({ coin: c, usd: N(m[c].s / m[c].c, 2), updated: w[c].t })
		}
		result = {
			prev,
			date,
			week,
			month
		}
		logCache.updated = currentTime
		logCache.chart = result
	} else {
		result = logCache.chart
	}
	return result
}

router.post("/portal/new-txs",async (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null)=>{
		if (session!==null) {
			const user = await Users.findOne({username:session.username})
			if (!user) return {error:1004}
			if (user.status===0) return {error:1005}
			const txs = [] as TxType[]

			const addrs = {} as {[key:string]:boolean}
			for(let i in user.wallets) {
				if (user.wallets[i]) {
					if (i==='evm') {
						addrs[user.wallets[i].toLowerCase()]=true
					} else {
						addrs[user.wallets[i]]=true
					}
					
				}
			}
			const $in = Object.keys(addrs)
			if ($in.length) {
				const rows = await Txs.find({address:{$in}}).sort({created:-1}).toArray()
				if (rows) {
					for(let i of rows) {
						txs.push({
							txid: 		i.txid,
							chain: 		i.chain,
							coin: 		i.coin,
							address:	i.address,
							confirms:	i.confirmations,
							confirmed:	i.confirmed,
							input: 		true,
							amount: 	i.amount,
							created:	i.created
						})
					}
				}
			}
			const logs = await get_portal_chart()
			
			const result:NewtxsResponseType = {
				balances: 	user.balances,
				wallets: 	user.wallets,
				prices,
				logs,
				txs
			}
			return {result}
		} else {
			return {error:2000}	
		}
	})
})

export const cronChain = async (key:string) => {
	await checkEVMs(key)
	await checkEvents(key)
	setTimeout(()=>cronChain(key), 15000)
}

const evm_sendtx = async (feeOnly:boolean, rpc:string, privkey:string, to:string, abi:any, method:string, args:any[] ): Promise<string|bigint | null> => {
	const web3 = new Web3(rpc)
	const account = web3.eth.accounts.privateKeyToAccount(privkey)
	const contract = new web3.eth.Contract(abi, to, { from: account.address, })
	const data = contract.methods[method](...args).encodeABI()
	const gasPrice = await web3.eth.getGasPrice()
	const gasLimit = await contract.methods[method](...args).estimateGas()
	if (feeOnly) return BigInt(gasPrice) * BigInt(gasLimit)
	const json = { gasPrice, gasLimit, to, value: 0x0, data }
	const signedTx: any = await web3.eth.accounts.signTransaction( json, privkey )
	const receipt = await web3.eth.sendSignedTransaction( signedTx.rawTransaction )
	if (receipt && receipt.transactionHash) return receipt.transactionHash
	return null
}

const evm_checktx = async (chain:string, txs:Array<string>):Promise<{[txId:string]:number}> =>  {
	const rpc = chains[chain].rpc
	const confirmations = chains[chain].confirmations
	const web3 = new Web3(rpc)
	const height = await web3.eth.getBlockNumber()
	const limit = 20
	const count = txs.length
	const result:{[txId:string]:number} = {}
	for(let i=0; i<count; i+=limit) {
		const json:Array<{jsonrpc:string, method:string, params:Array<string>, id:number}> = []
		let iEnd = i + limit
		if (iEnd>count) iEnd = count
		for (let k=i; k<iEnd; k++) {
			json.push({jsonrpc: '2.0', method: 'eth_getTransactionReceipt', params: [txs[k]], id: k++})
		}
		const response = await callChainApi(rpc, json, { 'x-token': chainApiKey })
		/* const result:any = await axios({
			method: 'post',
			url: rpc,
			data: json,
			headers: {'Content-Type': 'application/json'}
		}) */
		if (response!==null && Array.isArray(response)) {
			for(let v of response) {
				result[txs[v.id]] = (v.result && v.result.status === '0x1') ? (height - Number(v.result.blockNumber) + 1 >= confirmations ? 1 : 0) : -1
			}
		}
	}
	return result
}

const checkEVMs = async (chain:string) => {
	try {
		const net = chains[chain]
		const web3 = new Web3(net.rpc)
		const contract = new web3.eth.Contract(bridgeAbi, net.bridge)
		const latestHeight = await web3.eth.getBlockNumber()
		const row = await Blocks.findOne({chain})
		if (row!==null) {
			const start = row.height + 1
			const limit = 1000
			const inserts = [] as SchemaEvents[]
			for(let i = start; i <= latestHeight; i += limit) {
				
				let toBlock = i+limit
				if (toBlock > latestHeight) toBlock = latestHeight
				const events = await contract.getPastEvents("Deposit",{fromBlock:i, toBlock})
				for(const v of events) {
					const txid = v.transactionHash
					const blocknumber = v.blockNumber
					const {token, from, amount, targetChain} = v.returnValues as {token:string, from:string, amount:string, targetChain:number}
					inserts.push({
						_id:		getNewId(),
						txid,
						blocknumber, 
						address:	from, 
						token:		token===NULLADDRESS ? null : token, 
						chain: 		net.chainId || 0,
						targetchain:targetChain, 
						value:		toHex(amount), 
						updated:	0,
						created:	Math.round(new Date().getTime()/1000)
					})
					setlog(`detect: ${txid} #${blocknumber} target:${targetChain} from:[${from}] tx: [${txid}] amount:[${amount}]`)
				}
				await new Promise(resolve=>setTimeout(resolve, 1000))
			}
			if (inserts.length) {
				await Events.insertMany(inserts)
			}
		}
		await Blocks.updateOne({chain}, {$set:{chain, height:latestHeight}}, {upsert:true})
	} catch (error) {
		setlog('checkEVMs', error)
	}
}

const getTokenFee = (fee:bigint, chain:string, token:string)=>{
	const rate = BigInt(Math.round(prices[chains[chain].coin] * 1e6 / prices[token]))
	return fee * rate / BigInt(1e6)
}

const getTxParams = (targetchain:string, es:Array<WithId<SchemaEvents>>, fee?:bigint) => {
	const params = []
	for (let i of es) {
		if (i) {
			const coin = coinByAddress[i.chain][i.token || '-'].coin
			let value = BigInt(i.value)
			let extra = i.txid
			if (fee) {
				const realfee = getTokenFee(fee, targetchain, coin)// BigInt(Math.ceil( * 1e6)) * BigInt(10**(G.tokens[chain][token].decimals - 6))
				if (value<realfee) continue
				value -= realfee
			}
			params.push([
				i.token || NULLADDRESS,
				i.address, // _to
				value,
				extra
			])
		}
	}
	return params
}

const checkEvents = async (key:string) => {
	try {
		const net = chains[key]
		const bridge = net.bridge || ''
		const updated = now()
		
		const cs:{[chain:string]:Array<string>} = {}
		const rowTxs:{[txId:string]:WithId<SchemaEvents>} = {}
		const events = await Events.find({targetchain:net.chainId, err:0, senderr:0, tx:{$exists:false}}).toArray()
		if (events.length) {
			for(let i of events) {
				rowTxs[i.txid] = i
				const chain = chainByIds[i.chain]
				if (chain===undefined) cs[chain] = []
				cs[chain].push(i.txid)
			}
			const lists = [] as Array<any>
			
			Object.keys(chainByIds).map(i=>{
				const chain = chainByIds[Number(i)]
				if (cs[chain].length) lists.push(evm_checktx(chain, cs[chain]))
			})
			const results = await Promise.all(lists)
			const updates = [] as Array<AnyBulkWriteOperation<SchemaEvents>>
			// Array<{ key:string, tx:string|null, fee:string, sendvalue:string, err:number, senderr:number, updated:number }> = []
			const txs:Array<string> = []
			for(let res of results) {
				for(let i in res) {
					if (res[i]===-1) {
						updates.push({
							updateOne: {
								filter: {
									_id: rowTxs[i]._id 
								},
								update: { $set: {
									err:		1,
									updated
								}}
							}
						})
					} else if (res[i]===1) {
						txs.push(i)
					}
				}
			}
	
			if (txs.length) {
				const limit = 50
				const count = txs.length
				
				for(let i=0; i<count; i+=limit) {
					let iEnd = i + limit
					if (iEnd>count) iEnd = count
					const ts = [] as WithId<SchemaEvents>[]
					for (let k=i; k<iEnd; k++) {
						ts.push(rowTxs[txs[k]])
					}
					if (key==='ICICB') {
						const tx = await evm_sendtx(false, net.rpc, privKey, bridge, bridgeAbi, 'transfer', [getTxParams(key, ts)])
						if (typeof tx==='string') {
							for(let v of ts) {
								updates.push({
									updateOne: {
										filter:{ _id: v._id },
										update: { $set: {
											txid: 		v.txid,
											sendtx:		String(tx),
											sendvalue: 	v.value,
											updated
										}}
									}
								})
								/* updates.push({key:v.key, tx, fee:"0", sendvalue:v.value, err:0, senderr:0, updated}) */
								setlog(`send: target ${key} from:[address:${v.address}, value:${v.value} tx:${tx}]`)
							}
						}
					} else {
						const fee = await evm_sendtx(true, net.rpc, privKey, bridge, bridgeAbi, 'transfer', [getTxParams(key, ts)])
						if (typeof fee==='bigint') {
							const realfee = fee / BigInt(ts.length)
							const param = getTxParams(key, ts, realfee)
							const tx = await evm_sendtx(false, net.rpc, privKey, bridge, bridgeAbi, 'transfer', [param])
							if (typeof tx==='string') {
								for(let v of ts) {
									updates.push({
										updateOne: {
											filter:{ _id: v._id },
											update: { $set: {
												txid: 		v.txid,
												sendtx:		String(tx),
												fee: 		"0x" + realfee.toString(16),
												sendvalue: 	v.value,
												updated
											}}
										}
									})
									/* updates.push({key:v.key, tx, fee:'0x'+realfee.toString(16), sendvalue:v.value, err:0, senderr:0, updated}) */
									setlog(`send: target ${key} from:[address:${v.address}, value:${v.value}, fee:${realfee}, tx:${tx}]`)
								}
							}
						} else {
							for(let v of ts) {
								updates.push({
									updateOne: {
										filter:{ _id: v._id },
										update: { $set: {
											txid: 		v.txid,
											err: 		2,
											updated
										}}
									}
								})
								// updates.push({key:v.key, tx:null, fee:"0", sendvalue:"0", err:0, senderr:1, updated})
							}
							setlog(`send: target ${key} fee error`)
						}
					}
				}
			}
			if (updates.length) await Events.bulkWrite(updates)
		}
	} catch (error) {
		setlog('checkEvents', error)
	}
}

router.post("/bridge/get-txs", (req, res, next)=>{
	serverResponse(req, res, async (session:SessionType|null)=>{
		const results:{[key:string]:{tx:string,err:boolean,fee?:number}} = {}
		const txs = req.body
		/* if (txs.length>10) return res.status(429).json({err:'too many requests'})
		if (!Array.isArray(txs)) return res.status(429).json({err:'invalid format'})
		
		for(let v of txs) {
			if (!/0x[0-9a-fA-F]{64}/.test(v)) return res.status(429).json({err:'invalid format'})
			results[v] = {tx:'',err:true}
		} */
		const rows = await Events.find({txid:{$in:txs}}).toArray()
		if (rows) {
			for(let i of rows) {
				if (i.sendtx) {
					const decimals = chains[chainByIds[i.targetchain]].decimals - 6
					results[i.txid].fee =  i.fee ? Number(BigInt(i.fee) / BigInt(10 ** decimals)) / 1e6 : 0
					results[i.txid].tx = i.sendtx
					results[i.txid].err = false
				} else if (!i.err) {
					results[i.txid].err = false
				}
			}
		}
		
		const result = Object.keys(results).map(key=>({...results[key], key}))
		return {result}
	})
})

router.post("/bridge/get-all-tokens",async (req, res, next)=>{
	serverResponse(req, res, async (session:SessionType|null)=>{
		return {result:coins}
	})
})

const getGitHubUserData = async (access_token:string)=>{
	const {data} = await axios({url:"https://api.github.com/user",method:"get",headers:{Authorization:`token ${access_token}`}})
	return data
}

const verifyRecaptcha = async (token:string, ip:string) => {
	const params = new URLSearchParams()
	params.append('secret', recaptchaSecret)
	params.append('response', token)
	params.append('remoteip', ip)
	const verify = await axios.post('https://www.google.com/recaptcha/api/siteverify', params,{headers: {'Content-Type': 'application/x-www-form-urlencoded'}})
	return verify.data.success
}

router.post('/faucet/request', async (req, res, next) => {
	serverResponse(req, res, async (session:SessionType|null)=>{
		const ip:any = req.headers['x-forwarded-for'] || req.socket.remoteAddress
		const {network,address,token,access_token} = req.body
		if (!token) return {error:1001}
		const verify = await verifyRecaptcha(token, ip)
		if (!verify) return {error:1002}
		const response = await getGitHubUserData(access_token)
		if (!response) return {error:1003}
		const {login,created_at,total_private_repos,public_repos} = response
		if (total_private_repos + public_repos === 0) return {error:1004}
		const created = now()
		const gitCreated = Math.round(new Date(created_at).getTime()/1000)
		if (created - gitCreated < MIN_GITOLD * 86400) return {error:1005} // Created a month ago at least
		let uid = null as ObjectId|null
		let row = await Faucets.findOne({git:login})
		if (row===null) row = await Faucets.findOne({address})
		if (row===null) {
			uid = getNewId()
			await Faucets.insertOne({
				_id: 		uid,
				ip: 		ip,
				git:		login,
				address,
				count:   	1,
				updated:  	created,
				created
			})
		} else {
			if (created - row.updated < 86400 || row.count > 5) return {error:1006}
			if (row.ip !== ip) return {error:1007}
			uid = row._id
			await Faucets.updateOne({
				_id:		uid
			},{
				count:   	row.count + 1,
				updated:  	created
			})
		}
		await FaucetReqs.insertOne({
			_id:	getNewId(),
			uid,
			chain:network,
			address,
			amount:FAUCET_AMOUNT,
			updated:0,
			created
		})
		return {result:true}
	})
})

router.get('/authenticate/github', async (req, res, next) => {
	/* let status:string = ''
	try {
		const {code} = req.query
		if (code) {
			const {data} = await axios.post(`https://github.com/login/oauth/access_token`, {client_id: githubClientId,client_secret: githubSecretKey,code,}, {headers:{accept:'application/json'}})
			const {access_token} = data
			if (access_token) { 
				status = access_token
			} else {
				status = GIT_FAILED
			}
		} else {
			status = GIT_INVALID
		}
	} catch (err) {
		setlog(err)
		status = FAUCET_ERROR
	}
	req.session.status = enc(status) */
	res.redirect('/')
})

router.post("/admin/login", (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null)=>{
		if (session!==null) {
			return {error:1008}
		} else {
			const { username, password } = req.body as LoginReqeustType
			if (validateEmail(username)===false && validateUsername(username)===false) return {error:1001}
			if (password.length!==64) return {error:1003}
			const row = await Admins.findOne({$or:[{username}, {email:username}]})
			if (!row) return {error:1004}
			if (Number(row.status)===0) return {error:1005}
			if (password!==row.password) return {error:1006}
			const created = now()
			const token = hmac256([row.username, created].join('-'), secret)
			await setSession(token, {username:row.username, created})
			const result:LoginResponseType = {
				token,
				username: row.username,
				email: row.email,
				lastSeen: row.lastSeen,
				created: row.created
			}
			return {result}
		}
	})
})

const admin_get_account_total = async ():Promise<AdminTotalType> => {
	const result = {total:0, used:0}
	let rows =  await Users.aggregate([{
		$facet: {
			used: [
				{$project: { count: {"$size": {"$objectToArray":"$balances"}}}},
				{$match:   { count: {$gt:0}}},
				{$count: "v"}
			],
			total: [
				{$count: "v"}
			]
		}
	}]).toArray()
	if (rows) {
		result.total = rows[0].total?.[0]?.v || 0
		result.used = rows[0].used?.[0]?.v || 0
	}
	return result
}

const admin_get_deposit_daily = async ():Promise<{ [coin:string]: AdminDailyType[] }> => {
	const result = {} as { [coin:string]: AdminDailyType[] }
	const rows = await Txs.aggregate([
		{ 
			$project: {
				time: { $subtract: ['$created', { $mod: [ '$created', 86400 ] }] },
				coin: "$coin",
				v: "$amount"
			}
		}, {
			$group: {
				_id: { coin: "$coin", time: "$time" },
				v: { $sum: "$v" }
			}
		}, {
			$sort: {
				"_id.coin": 1, 
				"_id.time": 1
			}
		}
	]).toArray() as any
	if (rows) {
		const usds = {} as {[date:number]:number}
		for (let i of rows) {
			const coin = i._id.coin
			result[ coin ] ??= []
			result[ coin ].push({ date: i._id.time, value: i.v })
			usds[ i._id.time ] = ( usds[ i._id.time ] || 0 ) + i.v * prices[coin]
		}
		result.usd = []
		for (let date in usds) {
			result.usd.push( { date:Number(date), value:usds[date] } )
		}
		for (let coin in result) {
			const v = result[coin]
			for(let k=1; k<v.length; k++) {
				v[k].value += v[k - 1].value
			}
		}
	}
	return result
}

const admin_get_deposit_total = async ():Promise<AdminDepositType[]> => {
	const result = [] as AdminDepositType[]
	const rows = await Txs.aggregate([
		{ $group: {
			_id: "$coin",
			a: {
				$sum: "$amount"
			}
		}}
	]).toArray() as any
	if (rows) {
		let usd = 0
		for (let i of rows) {
			const balance = Math.round(i.a * 1e6) / 1e6
			result.push({ coin: i._id, balance })
			usd += balance * ( prices[i._id] || 0 )
		}
		result.sort((a,b)=>CoinSeq[a.coin] - CoinSeq[b.coin])
		result.push({ coin: 'USD', balance:usd })
	}
	return result
}

const admin_get_wallet_total = async ():Promise<AdminAddressTotalType[]> => {
	const tmp = {} as {[chain:string]: AdminTotalType}
	const rows = await Addrs.aggregate([{
		$facet: {
			"total": [{
				$group : {
					_id : "$chain",
					v: { $count: {} }
				}
			}],
			"used": [
				{ $match: { uid: { $exists:1 } } },
				{ $group : {
					_id : "$chain",
					v: { $count: {} }
				}}
			],
		}
	}]).toArray() as any
	if (rows) {
		for(let i of rows[0].total) {
			tmp[i._id] ??= {total:0, used:0}
			tmp[i._id].total = i.v
		}
		for(let i of rows[0].used) {
			tmp[i._id] ??= {total:0, used:0}
			tmp[i._id].used = i.v
		}
	}
	const result = [] as AdminAddressTotalType[]
	for(let k in tmp) {
		result.push({
			chain:	k,
			total:	tmp[k].total,
			used:	tmp[k].used
		})
	}
	result.sort((a,b)=>ChainSeq[a.chain] - ChainSeq[b.chain])
	return result
}

const admin_get_referral_total = async ():Promise<AdminTotalType> => {
	const result = {total:0, used:0}
	let rows =  await Referral.aggregate([
		{
			$facet: {
				total: [ 
					{
						$project: {
							v: {$size:"$accounts"}
						},
					}, {
						$count: "v"
					}
				],
				used: [
					{
						$project: {
							v: {$size:"$accounts"}
						},
					}, {
						$match: {
							v: {$ne:0}
						},
					}, {
						$count: "v"
					}
				]
			}
		}
	]).toArray()
	if (rows) {
		result.total = rows[0].total?.[0]?.v || 0
		result.used = rows[0].used?.[0]?.v || 0
	}
	return result
}

const admin_get_presale_total = async ():Promise<AdminTotalType> => {
	const result = {total:0, used:0}
	let rows =  await Presale.aggregate([{
		$facet: {
			total: [ {$count: "v"} ],
			used: [
				{ $match: { uid: { $exists:1 } } },
				{ $count: "v" }
			]
		}
	}]).toArray()
	if (rows) {
		result.total = rows[0].total?.[0]?.v || 0
		result.used = rows[0].used?.[0]?.v || 0
	}
	return result
}

const admin_get_voucher_total = async ():Promise<AdminTotalType> => {
	const result = {total:0, used:0}
	let rows =  await Voucher.aggregate([{
		$facet: {
			total: [ {$count: "v"} ],
			used: [
				{ $match: { uid: { $exists:1 } } },
				{ $count: "v" }
			]
		}
	}]).toArray()
	if (rows) {
		result.total = rows[0].total?.[0]?.v || 0
		result.used = rows[0].used?.[0]?.v || 0
	}
	return result
}

router.post("/admin/get-total", (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null, isAdmin?:boolean)=>{
		if (session===null) {
			return {error:2000}
		} else if (isAdmin===false) {
			return {error:10000}
		} else {
			const result = {
				customer: 	await admin_get_account_total(),
				wallet: 	await admin_get_wallet_total(),
				daily: 		await admin_get_deposit_daily(),
				deposits: 	await admin_get_deposit_total(),
				referral: 	await admin_get_referral_total(),
				presale: 	await admin_get_presale_total(),
				voucher: 	await admin_get_voucher_total(),
				chart:		await get_portal_chart(),
				prices,
				txs:		[],
				orders:		[]
			} as AdminDashboardType
			let LIMIT = 5
			let userFilters = [] as any[]
			let resTxs = await Txs.find({}).sort({created:-1}).limit(LIMIT).toArray()
			if (resTxs && resTxs.length) {
				
				for (let i of resTxs) {

					userFilters.push({['wallets.' + (evmChains.indexOf(i.chain)===-1 ? i.chain : 'evm')]:i.address})
					result.txs.push({
						username:	'',
						chain: 		i.chain,
						coin: 		i.coin,
						address: 	i.address,
						confirms:	i.confirmations,
						confirmed: 	i.confirmed,
						input: 		true,
						amount: 	i.amount,
						created:	i.created,
					})
				}
				const resUsers = await Users.find({ $or: userFilters }).toArray()
				if (resUsers) {
					const tmp = {} as {[key:string]:string}
					for (let user of resUsers) {
						for(let chain in user.wallets) {
							tmp[chain + user.wallets[chain]] = user.email
						}
					}
					for (let tx of result.txs) {
						tx.username = tmp[(evmChains.indexOf(tx.chain)===-1 ? tx.chain : 'evm') + tx.address] || ''
					}
				}
			}
			let userArray = [] as ObjectID[]
			let resReqs = await Reqs.find({}).sort({created:-1}).limit(LIMIT).toArray()
			if (resReqs && resReqs.length) {
				for (let i of resReqs) {
					userArray.push(i.uid)
					result.orders.push({
						username: 	i.uid.toHexString(),
						coin: 		i.coin,
						quantity: 	i.quantity,
						target: 	i.target,
						amount: 	i.amount,
						txid: 		i.txid || '',
						updated: 	i.updated,
						created: 	i.created
					})
				}
				const resUsers = await Users.find({ _id: { $in:userArray } }).toArray()
				if (resUsers) {
					const tmp = {} as { [key:string]:string }
					for (let user of resUsers) {
						tmp[user._id.toHexString()] = user.email
					}
					for (let tx of result.orders) {
						tx.username = tmp[tx.username] || ''
					}
				}
			}
			return { result }
		}
	})
})

router.post("/admin/get-users", (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null, isAdmin?:boolean)=>{
		if (session===null) {
			return {error:2000}
		} else if (isAdmin===false) {
			return {error:10000}
		} else {
			let { query, page, limit, count, sort } = req.body as AdminQueryType
			const where = {} as Filter<SchemaUsers>
			if (query) {
				const regex = new RegExp(query)
				//where.$or = [{username:{$regex:regex}}, {email:{$regex:regex}}]
			}
			if ( count===0 ) count = await Users.count(where)
			const data = [] as AdminCustomerType[]
			if (count) {
				let total = Math.ceil(count / limit)
				if ( page >= total ) page = total - 1
				if ( page < 0 ) page = 0

				const sortFields = {} as {[key:string]:1|-1}
				if (sort && Object.keys(sort).length) {
					for (let k in sort) sortFields[k] = sort[k] ? 1 : -1
				} else {
					sortFields.created = -1
				}
				const rows = await Users.aggregate([
					{ $match: where },
					{ $project: {
							_id: 1,
							username: 1,
							email:1,
							created:1, 
							"icicb": {$ifNull:[{$add:["$balances.icicb.balance", "$balances.icicb.locked"]}, 0]},
							"btc":   {$ifNull:[{$add:["$balances.btc.balance",   "$balances.btc.locked"]}, 0]},
							"ltc":   {$ifNull:[{$add:["$balances.ltc.balance",   "$balances.ltc.locked"]}, 0]},
							"eth":   {$ifNull:[{$add:["$balances.eth.balance",   "$balances.eth.locked"]}, 0]},
							"bnb":   {$ifNull:[{$add:["$balances.bnb.balance",   "$balances.bnb.locked"]}, 0]},
							"usdt":  {$ifNull:[{$add:["$balances.usdt.balance",  "$balances.usdt.locked"]}, 0]},
						}
					}, {
						$addFields: {
							usd: {$add: [
								{ $multiply:["$icicb", prices.icicb || 0] },
								{ $multiply:["$btc",   prices.btc   || 0] },
								{ $multiply:["$ltc",   prices.ltc   || 0] },
								{ $multiply:["$eth",   prices.eth   || 0] },
								{ $multiply:["$bnb",   prices.bnb   || 0] },
								"$usdt",
							]}
						}
					}, {
						$sort: sortFields
					}, {
						$skip: page * limit
					}, {
						$limit: limit
					}
				]).toArray()
				if (rows) {
					for (let v of rows) {
						const i = v as any
						data.push({
							id: 			i._id.toHexString(),
							username: 		i.username,
							email: 			i.email,
							usd:			i.usd || 0,
							icicb:			i.icicb || 0,
							btc:			i.btc || 0,
							eth:			i.eth || 0,
							bnb:			i.bnb || 0,
							ltc:			i.ltc || 0,
							usdt:			i.usdt || 0,
							created: 		i.created
						})
					}
				}
			}
			return { result: { count, data } }
		}
	})
})
router.post("/admin/update-balance", (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null, isAdmin?:boolean)=>{
		if (session===null) {
			return {error:2000}
		} else if (isAdmin===false) {
			return {error:10000}
		} else {
			let { uid, balances } = req.body as { uid:string, balances:{[key:string]:number} }
			const user = await Users.findOne({_id:getObjectId(uid)})
			if (!user) return {error:1004}
			const data = {} as {[key:string]:{balance:number, locked:number}}
			for (let k in balances) {
				data["balances." + k] = {
					balance: 	balances[k], 
					locked: 	(user.balances?.[k]?.locked || 0)
				}
			}
			const result = await Users.updateOne({ _id: getObjectId(uid) }, { $set:data })
			return { result: !!(result && result.modifiedCount) }
		}
	})
})

router.post("/admin/get-txs", (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null, isAdmin?:boolean)=>{
		if (session===null) {
			return {error:2000}
		} else if (isAdmin===false) {
			return {error:10000}
		} else {
			let { page, limit, count } = req.body as AdminQueryType
			const where = {} as Filter<SchemaTxs>
			if ( count===0 ) count = await Txs.count(where)
			const data = [] as AdminTxType[]
			if (count) {
				let total = Math.ceil(count / limit)
				if ( page < 0 ) page = 0
				if ( page >= total ) page = total - 1
				const rows = await Txs.find(where).sort( { created: -1 } ).skip(page * limit).limit(limit).toArray()
				if (rows) {
					let userFilters = [] as any[]
					for (let i of rows) {
						userFilters.push({['wallets.' + (evmChains.indexOf(i.chain)===-1 ? i.chain : 'evm')]:i.address})
						data.push({
							username:		'',
							chain: 			i.chain,
							coin: 			i.coin,
							address: 		i.address,
							confirms:		0,
							confirmed: 		i.confirmed,
							input: 			true,
							amount: 		i.amount,
							created:		i.created,
						})
					}
					const resUsers = await Users.find({ $or: userFilters }).toArray()
					if (resUsers) {
						const tmp = {} as {[key:string]:string}
						for (let user of resUsers) {
							for(let chain in user.wallets) {
								tmp[chain + user.wallets[chain]] = user.email
							}
						}
						for (let tx of data) {
							tx.username = tmp[(evmChains.indexOf(tx.chain)===-1 ? tx.chain : 'evm') + tx.address] || ''
						}
					}
				}
			}
			
			return { result: { count, data } }
		}
	})
})

router.post("/admin/get-orders", (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null, isAdmin?:boolean)=>{
		if (session===null) {
			return {error:2000}
		} else if (isAdmin===false) {
			return {error:10000}
		} else {
			let { page, limit, count } = req.body as AdminQueryType
			const where = {} as Filter<SchemaReqs>
			/* if (query!=='') {
				const regex = new RegExp(query)
				where.$or = [{username:{$regex:regex}}, {email:{$regex:regex}}]
			} */
			if ( count===0 ) count = await Reqs.count(where)
			const data = [] as AdminOrderType[]
			if (count) {
				let total = Math.ceil(count / limit)
				if ( page < 0 ) page = 0
				if ( page >= total ) page = total - 1
				const rows = await Reqs.find(where).sort( { created: -1 } ).skip(page * limit).limit(limit).toArray()
				if (rows) {
					let userArray = [] as ObjectID[]
					for (let i of rows) {
						userArray.push(i.uid)
						data.push({
							username:		i.uid.toHexString(),
							coin: 			i.coin,
							quantity: 		i.quantity,
							voucher:		i.voucher,
							target: 		i.target,
							amount: 		i.amount,
							txid: 			i.txid,
							updated:		i.updated,
							created:		i.created,
						})
					}
					const resUsers = await Users.find({ _id: { $in:userArray } }).toArray()
					if (resUsers) {
						const tmp = {} as { [key:string]:string }
						for (let user of resUsers) {
							tmp[user._id.toHexString()] = user.email
						}
						for (let tx of data) {
							tx.username = tmp[tx.username] || ''
						}
					}
				}
			}
			return { result: { count, data } }
		}
	})
})

router.post("/admin/get-wallets-total", (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null, isAdmin?:boolean)=>{
		if (session===null) {
			return {error:2000}
		} else if (isAdmin===false) {
			return {error:10000}
		} else {
			return {result: await admin_get_wallet_total()}
		}
	})
})
router.post("/admin/get-wallets", (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null, isAdmin?:boolean)=>{
		if (session===null) {
			return { error:2000 }
		} else if (isAdmin===false) {
			return { error:10000 }
		} else {
			let { query, page, limit, count } = req.body as AdminQueryType
			const where = {} as any
			if (query) {
				const regex = new RegExp( query, "i" )
				where.$or = [
					{ username:{ $regex:regex } },
					{ email:{ $regex:regex } },
					{ "wallets.v":{ $regex:regex } }
				]
			}
			if ( count===0 ) {
				const rows = await Users.aggregate([
					{ $project: { _id: '$_id', username: "$username", email: "$email", balances: {$objectToArray:"$balances"}, count: { $size:{$objectToArray: "$wallets"} }, wallets: {$objectToArray:"$wallets"} } },
					{ $match: { count: {$gt:0}, ...where } },
					{ $count: "c" }
				]).toArray()
				if (rows.length) {
					count = rows[0].c
				}
			}
			const data = [] as AdminWalletDetailType[]
			if (count) {
				let total = Math.ceil( count / limit )
				if ( page >= total ) page = total - 1
				if ( page < 0 ) page = 0
				const rows = await Users.aggregate([
					{ $project: { _id: '$_id', username: "$username", email: "$email", balances: {$objectToArray:"$balances"}, count: { $size:{$objectToArray: "$wallets"} }, wallets: {$objectToArray:"$wallets"} } },
					{ $match: { count: { $gt:0 }, ...where } },
					{ $limit: limit },
					{ $skip: page * limit }
				]).toArray()
				if (rows) {
					for (let i of rows) {
						data.push({
							id: 		i._id.toHexString(),
							username:	i.username,
							email:		i.email,
							balances:	i.balances,
							wallets:	i.wallets
						})
					}
				}
			}
			return { result: { count, data } }
		}
	})
})

router.post("/admin/get-referral-total", (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null, isAdmin?:boolean)=>{
		if (session===null) {
			return {error:2000}
		} else if (isAdmin===false) {
			return {error:10000}
		} else {
			return {result: await admin_get_referral_total()}
		}
	})
})

router.post("/admin/get-referral", (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null, isAdmin?:boolean)=>{
		if (session===null) {
			return { error:2000 }
		} else if (isAdmin===false) {
			return { error:10000 }
		} else {
			let { query, page, limit, count } = req.body as AdminQueryType
			const where = {} as any
			if (query) {
				const regex = new RegExp(query, "i")
				where.$or = [
					{accounts:{$regex:regex}},
					{_id:{$regex:regex}},
				]
			}
			if ( count===0 ) {
				const rows = await Referral.aggregate([
					{ $project: { _id: '$code', count: { $size: "$accounts" }, accounts: '$accounts' } },
					{ $match: { count: {$gt:0}, ...where } },
					{ $count: "c" }
				]).toArray()
				if (rows.length) {
					count = rows[0].c
				}
			}
			const data = [] as AdminReferralType[]
			if (count) {
				let total = Math.ceil(count / limit)
				if ( page >= total ) page = total - 1
				if ( page < 0 ) page = 0
				const rows = await Referral.aggregate([
					{ $project: { _id: '$code', count: { $size: "$accounts" }, accounts: '$accounts' } },
					{ $match: { count: {$gt:0}, ...where } },
					{ $limit: limit },
					{ $skip: page * limit }
				]).toArray()
				if (rows) {
					for (let i of rows) {
						data.push({
							code: 			i._id,
							count:			i.count,
							accounts:		i.accounts
						})
					}
				}
			}
			return { result: { count, data } }
		}
	})
})

router.post("/admin/get-presale-total", (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null, isAdmin?:boolean)=>{
		if (session===null) {
			return {error:2000}
		} else if (isAdmin===false) {
			return {error:10000}
		} else {
			return {result: await admin_get_presale_total()}
		}
	})
})

router.post("/admin/import-referral-code", (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null, isAdmin?:boolean)=>{
		if (session===null) {
			return {error:2000}
		} else if (isAdmin===false) {
			return {error:10000}
		} else {
			const {data} = req.body as {data:Array<string>}
			if (data.length===0) return {error:10001}
			for(let i of data) {
				if ( !isValidCode ('icref', i) ) return {error:10002}
			}
			const created = now()
			await Referral.insertMany(data.map(code=>(
				{
					_id: 	getNewId(),
					code,
					accounts: [],
					updated: 0,
					created
				}
			)))
			return {result:true}
		}
	})
})

router.post("/admin/import-presale-code", (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null, isAdmin?:boolean)=>{
		if (session===null) {
			return {error:2000}
		} else if (isAdmin===false) {
			return {error:10000}
		} else {
			const {data} = req.body as {data:Array<string>}
			if (data.length===0) return {error:10001}
			for(let i of data) {
				if ( !isValidCode ('icvip', i) ) return {error:10002}
			}
			const created = now()
			await Presale.insertMany(data.map(code=>(
				{
					_id: 	getNewId(),
					code,
					updated: 0,
					created
				}
			)))
			return {result:true}
		}
	})
})

router.post("/admin/get-voucher-total", (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null, isAdmin?:boolean)=>{
		if (session===null) {
			return {error:2000}
		} else if (isAdmin===false) {
			return {error:10000}
		} else {
			return {result: await admin_get_voucher_total()}
		}
	})
})

router.post("/admin/import-voucher-code", (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null, isAdmin?:boolean)=>{
		if (session===null) {
			return {error:2000}
		} else if (isAdmin===false) {
			return {error:10000}
		} else {
			const {data} = req.body as {data:Array<AdminVoucherCodeType>}
			if (data.length===0) return {error:10001}
			for(let i of data) {
				if ( !isValidCode ('icicb', i.code) ) return {error:10002}
			}
			const created = now()
			await Voucher.insertMany(data.map(i=>(
				{
					_id: 	getNewId(),
					code: i.code,
					amount: i.amount,
					updated: 0,
					created
				}
			)))
			return {result:true}
		}
	})
})

router.post("/admin/get-wallets", (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null, isAdmin?:boolean)=>{
		if (session===null) {
			return {error:2000}
		} else if (isAdmin===false) {
			return {error:10000}
		} else {
			return {result: await admin_get_wallet_total()}
		}
	})
})

router.post("/admin/import-wallets", (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null, isAdmin?:boolean)=>{
		if (session===null) {
			return {error:2000}
		} else if (isAdmin===false) {
			return {error:10000}
		} else {
			const {data} = req.body as {data:Array<AdminWalletType>}
			if (data.length===0) return {error:10001}
			const acceptable = ['evm', 'btc', 'ltc']
			const is = [] as Array<{
				_id: 		ObjectId,
				chain: 		string,
				address:	string,
				updated: 	number,
				created: 	number
			}>
			const created = now()
			for(let {chain, address} of data) {
				if (!chain || !address || acceptable.indexOf(chain)===-1)  return {error:10002}
				if (chain==='evm') address = address.toLowerCase()
				is.push({
					_id: 	getNewId(),
					chain,
					address,
					updated: 0,
					created
				})
			}
			if (is.length) {
				await Addrs.insertMany(is)
				return {result:true}
			}
			return {result:false}
		}
	})
})

router.post("/admin/set-icicb", (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null, isAdmin?:boolean)=>{
		if (session===null) {
			return {error:2000}
		} else if (isAdmin===false) {
			return {error:10000}
		} else {
			const { price } = req.body as { price:number }
			
			const updated = now()
			const icicb = await Icicb.findOne()
			if (icicb) {
				await Icicb.updateOne({ _id:icicb._id }, { $set:{price, updated} })
			} else {
				await Icicb.insertOne({ _id:getNewId(), price, updated })
			}
			prices.icicb = price
			return {result:true}
		}
	})
})
router.post("/admin-api/send-email", (req:express.Request, res:express.Response)=>{
	serverResponse(req, res, async (session:SessionType|null, isAdmin?:boolean)=>{
		const {to, subject, template} = req.body as AdminEmailType
		const params = {} as any
		const result = await sendMail(to, subject, template, params)
		return {result}
	})
})

export default router