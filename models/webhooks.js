var temp= require("mongoose");

var webhookSchema= new temp.Schema({
    targetUrl: {type: String, required: true},
    author: {
        type: String,
    },
    created: {type: Date, default: Date.now}
});
module.exports= temp.model("Webhook",webhookSchema);