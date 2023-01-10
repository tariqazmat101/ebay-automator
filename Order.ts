'use strict';
var AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
//import {Listing} from './d'
const {fetchcodes,recordTransaction,delay} = require("./dynamodb.js");

const DEFAULT_LISTING =
    {
        quantityMultiplier: 1,
        Description: "The default listing for this account",
        legacyItemId: ['275586756168'],
        DBtable: "codes",
        Subject: "✅Here's your MW2 Burger Town Code!",
        Instructions: "Redeem at https://callofduty.com/bkredeem"

    };

module.exports = class Order {
    DEFAULT_LISTING;
    name: string
    ddb;
    e;
    account;

    constructor(account, e) {
        this.account = account;
        this.e = e
        this.ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
        this.DEFAULT_LISTING = DEFAULT_LISTING;
       // this.handleOrder(e);
    }


    determineListings(e) {
        console.log(this.account.listings)
        console.log(e.lineItems)
        //Check which Listing
        let foundListing;

        for(const listing of this.account.listings){
            console.log(`Listing in inner loop: ${listing}`)
            if(listing.legacyItemID.find(item => item === e.lineItems[0].legacyItemId)){
                console.log("we have found this listing!" + listing)
                foundListing = listing;
                break;
            }
        }

        if (foundListing){
            console.log("Found listing", foundListing);
            return foundListing;
        }
            console.log("did not find listing")
            return DEFAULT_LISTING
    }

     async handleOrder(order) {
        const listing = this.determineListings(order); // Determine what Listing
        let count = order.lineItems[0].quantity * listing.quantityMultiplier;

        console.log("the Quantity is " + count);
        let buyername = order.buyer.username;
        let address = order.buyer.taxAddress;
        const {codes, links} = await fetchcodes(count, buyername,listing.DBtable)
        console.log(codes)

        const messageObject = {
            buyername: buyername,
            id: order.lineItems[0].legacyItemId,
            s3links: codes,
            links: links
        }

        //Record the transaction First
        try{
            await recordTransaction(order.legacyOrderId.toString(), codes.toString(), buyername, address);
            let messageResult = await this.sendOrderMessage(messageObject,listing).catch((e) => {
                console.log(e);
                throw e;
            });
            await delay(12000);
            await this.sendGoodbyeMessage(messageObject).catch((e) => {
                console.log(e);
                throw e;
            });
            await this.markasShipped(order)
        }
        catch (e){
            console.log(e)
            throw e;
        }
        console.log("RESULT FINISHED");
    }

    async markasShipped(order) {
        await this.account.api.sell.fulfillment.createShippingFulfillment(order.legacyOrderId, {
            lineItems: [
                {
                    lineItemId: order.lineItems[0].lineItemId,
                    quantity: order.lineItems[0].quantity
                }
            ]
        }).catch(e => {
            console.log(e);
            throw e;
        })
    }

    async sendOrderMessage(obj, listing) {
        console.log(this.account.api)
        let body = "Here are your code(s):\n"
        for (let i = 0; i < obj.s3links.length; i++) {
            body += obj.s3links[i].toString().replace(/-/g, "");
            body += "\n"
        }
        if (listing.Instructions) body += listing.Instructions;
        body += "\n Thank you for your purchase! And I hope I get to see you again!";
        body += "\n Grinding on MW2? We've got a 5-HOUR 2XP bundle!"
        body += "\n We also have Jacklinks codes available too! Check our ads :)"
        if (obj.links) {//todo This will be invoked even if obj.links == 0
            body += '\n\n P.S: Are you getting the error, "Code needs to be 12-15 characters long"?';
            body += "\n" + "If so, please manually enter the code from the image link(s) below👇" + "\n";
            obj.links.map(link => {
                body += link + "\n";
            })
        }
        console.log(body);

        let result = await this.account.api.trading.AddMemberMessageAAQToPartner({
            ItemID: obj.id,
            MemberMessage: {
                Body: body.toString(),
                QuestionType: "CustomizedSubject",
                Subject: listing.Subject,
                RecipientID: obj.buyername
            },
        }).catch((e) => {
            console.log(e);
        });
    }
    test(){
        console.log("hello world");
    }

    async sendGoodbyeMessage(obj) {
        // Send Message
        let result = await this.account.api.trading.AddMemberMessageAAQToPartner({
            ItemID: obj.id,
            MemberMessage: {
                Body: `
  Everything going well with the code? \n
  Let me know if any issues come up. \n
  Kind regards,\n
  John`,
                QuestionType: "CustomizedSubject",
                Subject: "Hope everything went well",
                RecipientID: obj.buyername
            },
        });
    }
}