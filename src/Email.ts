require("dotenv").config()

import * as fs from 'fs'
import { setlog } from './helper'
import * as nodemailer from 'nodemailer'

const cacheTemplates:{[key:string]:string} = {}
const SMTPHOST = process.env.SMTP || ''
const SMTPPORT = Number(process.env.SMTP_PORT)
const SMTPUSER = process.env.SMTP_USER || ''
const SMTPPASS = process.env.SMTP_PSSS || ''
const supportEmail = process.env.SUPPORT_EMAIL || ''

const sendEmailViaSMTP = async (to:string, subject:string, html:string):Promise<boolean> => {
	return await new Promise(resolve=>{
		const smtpTransport = nodemailer.createTransport({
			host: SMTPHOST,
			port: SMTPPORT,
			auth: {
				user: SMTPUSER,
				pass: SMTPPASS
			}
		});

		smtpTransport.sendMail({
			from: process.env.SMTP_USER,
			to,
			subject,
			html
		}, (error, info) => {
			if (error) {
				setlog('smtpTransport.sendMail', error)
				resolve(false)
			} else {
                resolve(true)
            }
		})
	})
}

const sendMail = async (email:string, subject:string, templateId:string, params:{[key:string]:string}): Promise<boolean> => {
    try {
        if (cacheTemplates[templateId]===undefined) {
			const filename = __dirname + '/../email-template/' + templateId + '.html'
			if (fs.existsSync(filename)) {
				cacheTemplates[templateId] = fs.readFileSync(filename).toString('utf-8')
			} else {
				setlog(`notfound email template [${templateId}]`)
				return false
			}
        }
        const contents = cacheTemplates[templateId];
		const keywords = {
			...params, 
			website:'http://icicbchain.com', 
			team: 'icicbchain support team', 
			domain: 'icicbchain.com', 
			support: supportEmail
		} as {[key:string]:string}
		const html = contents.replace(/{\{([^}]*)\}\}/g, (f,a)=>keywords[a])
        return await sendEmailViaSMTP(email, subject, html)
    } catch (error) {
        setlog('sendMail', error)
    }
    return false
}

export default sendMail