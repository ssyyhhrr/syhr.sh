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

app.post('/shorten', async function (req, res) {
    console.log(`[${timestamp()}] [${req.ip}] [${req.method}] ${req.protocol} ${req.originalUrl}`)
    console.log(req.body.email)
    return res.render('index')
})

app.listen(3000, () => {
    console.log(`[${timestamp()}] [START] app.js`)
})

function timestamp() {
    let date = new Date()

    let day = ("0" + date.getDate()).slice(-2)
    let month = ("0" + (date.getMonth() + 1)).slice(-2)
    let year = date.getFullYear()

    let hours = ("0" + (date.getHours())).slice(-2)
    let minutes = ("0" + (date.getMinutes())).slice(-2)
    let seconds = ("0" + (date.getSeconds())).slice(-2)

    return (day + "/" + month + "/" + year + " " + hours + ":" + minutes + ":" + seconds)
}