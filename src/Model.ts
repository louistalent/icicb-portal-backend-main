require('dotenv').config()
import { MongoClient, ObjectId } from 'mongodb';
import { SchemaAddrs, SchemaAdmins, SchemaBlocks, SchemaEvents, SchemaFaucets, SchemaFaucetsReqs, SchemaIcicb, SchemaLogs, SchemaPresale, SchemaPrices, SchemaReferral, SchemaReqs, SchemaTxs, SchemaUsers, SchemaVoucher } from './@types/model';
import { setlog } from './helper';
const dbname = process.env.DB_NAME || 'icicb'
const client = new MongoClient('mongodb://localhost:27017');
const db = client.db(dbname);

export const getNewId = () => new ObjectId()
export const getObjectId = (id:string) => new ObjectId(id)
export const Blocks = 	db.collection<SchemaBlocks>('blocks');
export const Events = 	db.collection<SchemaEvents>('events');
export const Icicb = 	db.collection<SchemaIcicb>('icicb');
export const Prices = 	db.collection<SchemaPrices>('prices');
export const Addrs = 	db.collection<SchemaAddrs>('addrs');
export const Users = 	db.collection<SchemaUsers>('users');
export const Referral = 	db.collection<SchemaReferral>('referral');
export const Presale = 	db.collection<SchemaPresale>('presale');
export const Voucher = 	db.collection<SchemaVoucher>('voucher');
export const Txs = 		db.collection<SchemaTxs>('txs');
export const Logs = 	db.collection<SchemaLogs>('logs');
export const Reqs = 	db.collection<SchemaReqs>('reqs');
export const Admins = 	db.collection<SchemaAdmins>('admins');
export const Faucets = 	db.collection<SchemaFaucets>('faucets');
export const FaucetReqs = 	db.collection<SchemaFaucetsReqs>('faucetreqs');

const connect = async () => {
	try {
		await client.connect()
		setlog('connected to MongoDB')
		Addrs.createIndex({ chain: 1, address: 1 }, { unique: true })
		Admins.createIndex( {username: 1}, { unique: true })
		Admins.createIndex( {email: 1}, { unique: true })

		Users.createIndex( {username: 1}, { unique: true })
		Users.createIndex( {email: 1}, { unique: true })
		
		Txs.createIndex( {chain: 1, address: 1, txid: 1}, { unique: true })
		
		Prices.createIndex( {coin: 1}, { unique: true })
		
		Referral.createIndex( {code: 1}, { unique: true })
		Presale.createIndex( {code: 1}, { unique: true })
		Voucher.createIndex( {code: 1}, { unique: true })

		Blocks.createIndex( {chain: 1}, { unique: true })
		Events.createIndex( {txid: 1}, { unique: true })

		Faucets.createIndex( {git: 1}, { unique: true })
		Faucets.createIndex( {address: 1}, { unique: true })

	} catch (error) {
		console.error('Connection to MongoDB failed', error)
		process.exit()
	}
}

export default { connect };