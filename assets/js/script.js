console.clear()

class Utils {
  static randomRange(min, max) {
    return Math.random() * (max - min) + min
  }

  static mapRange (value, inputMin, inputMax, outputMin, outputMax, clamp) {
    if (Math.abs(inputMin - inputMax) < Number.EPSILON) {
      return outputMin;
    } else {
      var outVal = ((value - inputMin) / (inputMax - inputMin) * (outputMax - outputMin) + outputMin);
      if (clamp) {
        if (outputMax < outputMin) {
          if (outVal < outputMax) outVal = outputMax;
          else if (outVal > outputMin) outVal = outputMin;
        } else {
          if (outVal > outputMax) outVal = outputMax;
          else if (outVal < outputMin) outVal = outputMin;
        }
      }
      return outVal;
    }
  }
}

Utils.simplex = new SimplexNoise('seed') 

class App {
  constructor() {
    this.config = {
      bgColor: chroma({ h: 230, s: 0.5, l: 0.92}).hex(),
      // https://www.colourlovers.com/palette/577622/One_Sixty-Eight
      colorSchema: [
        '#666666',
        '#555555',
        '#444444',
        '#333333',
        '#222222',
      ],
      numOfLayers: 9
    }
    
    this.canvas = document.getElementById('c')
    this.ctx = this.canvas.getContext('2d')
    
    this.shadowCanvas = document.createElement('canvas')
    this.shadowCtx = this.shadowCanvas.getContext('2d')
    
    this.timestamp = 0
    
    this.setUpVars()
    this.setUpListeners()
    // this.setUpGui()
    this.update()
  }

  setUpGui() {
    const pane = new Tweakpane()
    const folder = pane.addFolder({
      expanded: false,
      title: 'Settings',
    })
    folder.addInput(this.config, 'bgColor')
  }
  
  setUpVars() {
    this.canvas.width = this.shadowCanvas.width = this.wWidth = window.innerWidth
    this.canvas.height = this.shadowCanvas.height = this.wHeight = window.innerHeight
    this.wCenterX = this.wWidth / 2
    this.wCenterY = this.wHeight / 2
    this.wHypot = Math.hypot(this.wWidth, this.wHeight)
    this.wMin = Math.min(this.wWidth, this.wHeight)
    
    this.angle = Math.PI * 0.25
    this.layers = this.getLayers()
  }

  getLayers() {
    const layers = []
    let currColorId = 0
    
    for (let lid = 0; lid <= this.config.numOfLayers; lid++) {
      const colorAngle = Math.PI * 2 * (lid / this.config.numOfLayers)
      
      layers.push({
        id: lid, // used for noise offset
        progress: 1 - (lid / this.config.numOfLayers),
        color: this.config.colorSchema[currColorId]
      })

      currColorId++
      
      if (currColorId >= this.config.colorSchema.length) {
        currColorId = 0
      }
    }
    
    return layers
  }
  
  setUpListeners() {
    window.addEventListener('resize', this.setUpVars.bind(this))
  }

  drawLayer(ctx, layer) {
    const segmentBaseSize = 10
    const segmentCount = Math.round(this.wHypot / segmentBaseSize)
    const segmentSize = this.wHypot / segmentCount
    const waveAmplitude = segmentSize * 4
    const noiseZoom = 0.03
    
    ctx.save()
    ctx.translate(this.wCenterX, this.wCenterY)
    ctx.rotate(Math.sin(this.angle))
    
    ctx.beginPath()
    ctx.moveTo(-this.wHypot / 2, this.wHypot / 2 - (this.wHypot * layer.progress))
    ctx.lineTo(-this.wHypot / 2, this.wHypot / 2)
    ctx.lineTo(this.wHypot / 2, this.wHypot / 2)
    ctx.lineTo(this.wHypot / 2, this.wHypot / 2 - (this.wHypot * layer.progress))
    
    for (let sid = 1; sid <= segmentCount; sid++) {
      const n = Utils.simplex.noise3D(sid * noiseZoom, sid * noiseZoom, layer.id + this.timestamp)
      const heightOffset = n * waveAmplitude
      
      ctx.lineTo((this.wHypot / 2) - (sid * segmentSize), this.wHypot / 2 - (this.wHypot * layer.progress) + heightOffset)
    }
    
    ctx.closePath()
    ctx.fillStyle = layer.color
    ctx.fill()
    ctx.restore()
  }
  
  draw(ctx) {
    ctx.save()
    ctx.fillStyle = this.config.bgColor
    ctx.fillRect(0, 0, this.wWidth, this.wHeight)
    ctx.restore()
    
    this.layers.forEach(layer => this.drawLayer(ctx, layer))
  }
  
  update(t) {
    const prevTimestamp = this.timestamp * 5000
    
    if (t) {
      let shiftNeeded = false
      this.timestamp = t / 5000
      this.angle += 0.001
      
      this.layers.forEach(layer => {
        layer.progress += 0.001
        
        if (layer.progress > 1 + (1 / (this.layers.length - 1))) {
          layer.progress = 0
          shiftNeeded = true
        }
      })
      
      if (shiftNeeded) {
        this.layers.push(this.layers.shift())
      }
      
      this.draw(this.shadowCtx)
    }
    
    this.ctx.clearRect(0, 0, this.wWidth, this.wHeight)
    this.ctx.drawImage(this.shadowCanvas, 0, 0)
    
    window.requestAnimationFrame(this.update.bind(this))
  }
}

new App()

async function shortenURL() {
  var postReq = await fetch('/shorten', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({url: document.getElementById("email").value})})
  console.log("hello")
}

async function testURL() {
  doSpinner = true
  var url = document.getElementById("email").value
  if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url
  if (url.startsWith('http://syhr.sh') || url.startsWith('https://syhr.sh')) {
    document.getElementById("submit").style.color = "rgba(255, 255, 255, 1)"
    document.getElementById("email").style.animation = "shake 0.5s"
    document.getElementById("email").style.backgroundColor = "rgba(220, 22, 60, 0.3)"
    document.getElementById("spinner").style.color = "rgba(255, 255, 255, 0)"
    document.getElementById("spinner").style.display = "none"
    setTimeout(() => { 
      document.getElementById("email").style.backgroundColor = "inherit" 
      document.getElementById("email").style.animation = "none"
    }, 500)  
    return
  }
  setTimeout(() => {
    if (doSpinner) {
      document.getElementById("submit").style.color = "rgba(255, 255, 255, 0)"
      document.getElementById("spinner").style.color = "rgba(255, 255, 255, 1)"
      document.getElementById("spinner").style.display = "inline-block"
    }
  }, 100)
  fetch(url, { mode: "no-cors" }).then((async req => {
    doSpinner = false
    document.getElementById("submit").style.color = "rgba(255, 255, 255, 1)"
    document.getElementById("spinner").style.color = "rgba(255, 255, 255, 0)"
    document.getElementById("spinner").style.display = "none"
    let res = await fetch('/shorten', { method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: `url=${url}` })
    if (res.ok) {
      var content = JSON.parse(await res.json())
      document.getElementById("email").value = content.url
      document.getElementById("email").style.backgroundColor = "rgba(0, 255, 0, 0.3)"
      document.getElementById("email").style.animation = "grow 0.5s"
      setTimeout(() => { 
        document.getElementById("email").style.backgroundColor = "inherit"
        document.getElementById("email").style.animation = "none"
      }, 500)
    }
    else {
      document.getElementById("submit").style.color = "rgba(255, 255, 255, 1)"
      document.getElementById("email").style.animation = "shake 0.5s"
      document.getElementById("email").style.backgroundColor = "rgba(220, 22, 60, 0.3)"
      document.getElementById("spinner").style.color = "rgba(255, 255, 255, 0)"
      document.getElementById("spinner").style.display = "none"
      setTimeout(() => { 
        document.getElementById("email").style.backgroundColor = "inherit" 
        document.getElementById("email").style.animation = "none"
      }, 500)
    }
  })).catch(err => {
    document.getElementById("submit").style.color = "rgba(255, 255, 255, 1)"
    document.getElementById("email").style.animation = "shake 0.5s"
    document.getElementById("email").style.backgroundColor = "rgba(220, 22, 60, 0.3)"
    document.getElementById("spinner").style.color = "rgba(255, 255, 255, 0)"
    document.getElementById("spinner").style.display = "none"
    setTimeout(() => { 
      document.getElementById("email").style.backgroundColor = "inherit" 
      document.getElementById("email").style.animation = "none"
    }, 500)
  })
}

document.getElementById("submit").addEventListener("click", function(event) {
  event.preventDefault()
  testURL()
})