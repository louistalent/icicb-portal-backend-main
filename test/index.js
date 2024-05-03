require('colors')
require('dotenv').config()
const { expect } = require("chai");

const Model = require('../dist/Model')



const connectDatabase = () => {
    return Model.default.connect()
}

describe("backend", ()=>{

	it("test getting prices", async ()=>{
		await connectDatabase()
        /* const Users = Model.default.Users */
        const user = await Users.findOne({
            wallets: {ch:i.address}
        }).toArray()
        console.log(user)

	})
})