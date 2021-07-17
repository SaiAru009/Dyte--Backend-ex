var temp= require("mongoose"),
	passwithmongo= require("passport-local-mongoose");

var userSchema= new temp.Schema({
	username: String,
	password: String
});
userSchema.plugin(passwithmongo);
module.exports= temp.model("User",userSchema);