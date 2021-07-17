//Import required libraries
const express= require('express');
const app= express();
const bodyParse= require('body-parser');
const temp= require('mongoose');
const passport= require("passport");
const strategy= require("passport-local");
const passandmongo= require("passport-local-mongoose");
const ip= require('ip');                                         //User IP address
const {ServiceBroker}= require('moleculer');
const ApiService = require("moleculer-web");
var ParallelRequest = require('parallel-http-request');
const Webhook= require("./models/webhooks");
const user= require("./models/users");

require('dotenv').config();
app.set("view engine", "ejs");
app.use(bodyParse.urlencoded({ extended: true }));

//Setting up MongoDB
var mongourl = 'mongodb+srv://' + process.env.ATLASDB_USERID + ':' + process.env.ATLASDB_PWD + '@cluster0.xemgp.mongodb.net/test?retryWrites=true&w=majority';
temp.set('useUnifiedTopology', true);
temp.connect(mongourl, {
	useNewUrlParser: true,
	useCreateIndex: true
}).then(() => {
	console.log("Connected to DB!");
	app.listen(3000, function () {
		console.log('Server has started!');
	})

}).catch(err => {
	console.log("ERROR: ", err.message);
});

app.use(require("express-session")({
	secret: "My parents are greater than God to me!",
	resave: false,
	saveUninitialized: false
}));

//INITIALIZING Passport with Express
app.use(passport.initialize());
app.use(passport.session());

app.use(function(req, res, next){
	res.locals.currentUser= req.user;
	next();
})

passport.use(new strategy(user.authenticate()));
passport.serializeUser(user.serializeUser());
passport.deserializeUser(user.deserializeUser());

//Create a new broker
const broker= new ServiceBroker();

//Create a new parallel request
var request = new ParallelRequest();

//Create new service of broker
broker.createService({
    name: "webhooks",
    actions: {
        add(ctx){
            return Number(ctx.params.a) + Number(ctx.params.b);
        },

        register(ctx){
            const newurl= new Webhook({targetUrl: ctx.params.destUrl, author: ip.address()});
            newurl.save(function (err, newurl) {
                if(err) return err;
                console.log(newurl);                                           //Saved in DB
            });
            return newurl._id;
        },

        async list(){
            const reghooks= await Webhook.find({});
            /*Webhook.find(function (err, webhooks) {
                if (err) return console.error(err);
                //console.log(webhooks);
                })
            })*/
            //console.log(reghooks);
            return reghooks;
        },

        async update(ctx){
            var fg=0;
            await Webhook.findByIdAndUpdate(ctx.params.hookId, {targetUrl: ctx.params.newurl}, function(err,updatedHook){
                if(err){
                    return err;
                }
                else{
                    console.log("Updated User : ", updatedHook);
                    fg=1;
                }
            });
            if(fg==1) return "Sucessfully updated the corresponding webhook instance!";
        },

        async delete(ctx){
            var dfg=0;
            await Webhook.findByIdAndRemove(ctx.params.resid, err => {
                if (err) return err;
                else{
                    dfg=1;
                }
            });
            if(dfg==1) return "Sucessfully deleted the corresponding webhook instance!";
        },

        async trigger(ctx){
            var ip= ctx.params.ipAddress;
            var cnt=0, limit=10;                                            //Parallel request limit is 10.
            const reghooks= await Webhook.find({});
            console.log(reghooks);
            reghooks.forEach(function(webhook){
                request.add({
                    url: webhook.targetUrl,
                    method:'post',
                    headers:{'Content-Type':'application/json'},
                    body: {
                        ipAddress: ip,
                        sendTime: Date.now()
                    },
                    maxRedirects: 5
                })
                cnt+=1;
                if(cnt==limit){
                    request.send(function(response){                      //response array to the parallel requests.
                        console.log(response);
                    });
                    cnt=0;
                    request.clean();
                }
            })
            request.send(function(response){                      
                console.log(response);
            });
            request.clean();
        }
    }
});

//Express routes
app.get('/', function(req,res){
    res.render('home');
})

app.get('/webhooks/register', isLoggedIn, function(req,res){
    res.render('register_record');
})

app.get('/webhooks/update', isLoggedIn, function(req,res){
    res.render('update_record');
})

app.post('/webhooks/update', isLoggedIn, function(req,res){
    broker.call('webhooks.update',{hookId: req.body.id, newurl: req.body.url})
    .then(response => console.log(response))
    .catch(err => console.error("Unable to find or update the registered webhook:", err.message));
    res.redirect('/webhooks');
})

app.get('/webhooks', isLoggedIn, function(req,res){
    broker.call('webhooks.list')
    .then(response => console.log('Details of registered webhooks-',response))
    .catch(err => console.error("Unable to fetch the registered webhooks:", err.message));
    res.send('Listed all the registered webhooks in console!');
})

app.post('/webhooks', isLoggedIn, function(req,res){
    broker.call('webhooks.register',{destUrl: req.body.url})
    .then(response => console.log('Unique ID assigned to the saved Target URL:',response))
    .catch(err => console.error("Unable to register targetUrl:", err.message));
    res.redirect('/webhooks');
})

app.get('/webhooks/delete', isLoggedIn, function(req,res){
    res.render('delete_record');
})

app.post('/webhooks/delete', isLoggedIn, function(req,res){
    broker.call('webhooks.delete',{resid: req.body.id})
    .then(response => console.log(response))
    .catch(err => console.error("Error in deletion:", err.message));
    res.redirect('/webhooks');
})

//Calls webhooks.trigger action
app.get('/ip', isLoggedIn, function(req,res){
    broker.call('webhooks.trigger',{ipAddress: ip.address()})
    .then(response => console.log(response))
    .catch(err => console.error(err.message));
})

//Admin routes

//AUTH Routes
app.get("/register",function(req,res){
	res.render('register');
})

app.post("/register", function(req,res){
	var newUser= new user({username: req.body.username});
	user.register(newUser, req.body.password, function(err,body){
		if(err){
			console.log(err.message);
			res.redirect("/register");
		}
		passport.authenticate("local")(req, res, function(){
			res.redirect("/webhooks");
		})
	})
})

//LOGIN Routes.
app.get("/login", function (req, res) {
	res.render('login');
})

//Of the form app.post(url, middleware, callback)
app.post("/login", passport.authenticate("local", { successRedirect: "/webhooks", failureRedirect: "/login" }),
	function (req, res) {
	})

app.get("/logout", isLoggedIn, function (req, res) {
	req.logout();
	res.redirect("/");
})

//Start broker
broker.start();

//Auth Middleware
function isLoggedIn(req, res, next) {
	if (req.isAuthenticated() && req.user.username=="admin") {
        //console.log(req.user);
		return next();
	}
	// res.redirect("/login");
	else{
		console.log("You have to be logged in as Admin first!");
		res.redirect('/login');
	}
}