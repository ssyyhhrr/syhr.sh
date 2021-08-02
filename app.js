const express = require("express")

var app = express()

app.set("views", "views")
app.set("view engine", "ejs")

app.use(express.static("assets"))
app.use(express.urlencoded({ extended: true }))

app.get('/', async function(req, res) {
    console.log(`[${timestamp()}] [${req.ip}] [${req.method}] ${req.protocol} ${req.originalUrl}`)
    return res.render('index')
})