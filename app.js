const express = require("express")
const { Database } = require("sqlite3")
const db = new Database("data.db")
const fetch = require("node-fetch")
const favicon = require("serve-favicon")

var app = express()

app.set("views", "views")
app.set("view engine", "ejs")

app.use(favicon('favicon.ico'))
app.use(express.static("assets"))
app.use(express.urlencoded({ extended: true }))

app.get('/', async function(req, res) {
    console.log(`[${timestamp()}] [${req.ip}] [${req.method}] ${req.protocol} ${req.originalUrl}`)
    return res.render('index')
})

app.post('/shorten', async function (req, res) {
    console.log(`[${timestamp()}] [${req.ip}] [${req.method}] ${req.protocol} ${req.originalUrl}`)
    var content = JSON.parse(JSON.stringify(req.body))
    fetch(content.url, { mode: "no-cors" }).then((async req => {
        let duplicate = await query('SELECT slug, url FROM slugs WHERE url = ?', [content.url])
        if (duplicate.length > 0) return res.json(JSON.stringify({ url: `https://syhr.sh/${duplicate[0].slug}/` }))
        slug = generateSlug()
        let result = await query('SELECT slug FROM slugs WHERE slug = ?', [slug])
        while (result.length > 0) {
            slug = generateSlug()
            result = await query('SELECT slug FROM slugs WHERE slug = ?', [slug])
        }
        db.run("INSERT INTO slugs (slug, url) VALUES(?, ?)", [slug, content.url])
        res.json(JSON.stringify({ url: `https://syhr.sh/${slug}/` }))
    })).catch(err => {
        console.log(err)
        return
    })
})

app.get('/:slug', async function(req, res) {
    let result = await query('SELECT slug, url FROM slugs WHERE slug = ?', [req.params.slug])
    if (result.length > 0) {
        res.redirect(result[0].url)
    }
    else {
        return res.render('index')
    }
})

app.listen(4000, () => {
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

async function query(query, args) {
    return new Promise((res, rej) => {
      db.all(query, args, (err, rows) => {
        if (err) {
          rej(err)
          return
        }
        res(rows)
      })
    })
}

function generateSlug() {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < 6; i++ ) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}