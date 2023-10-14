function sleep(timeout) {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout)
  })
}

class Versor {
  static fromAngles([l, p, g]) {
    l *= Math.PI / 360;
    p *= Math.PI / 360;
    g *= Math.PI / 360;
    const sl = Math.sin(l), cl = Math.cos(l);
    const sp = Math.sin(p), cp = Math.cos(p);
    const sg = Math.sin(g), cg = Math.cos(g);

    return [
      cl * cp * cg + sl * sp * sg,
      sl * cp * cg - cl * sp * sg,
      cl * sp * cg + sl * cp * sg,
      cl * cp * sg - sl * sp * cg
    ];
  }

  static toAngles([a, b, c, d]) {
    return [
      Math.atan2(2 * (a * b + c * d), 1 - 2 * (b * b + c * c)) * 180 / Math.PI,
      Math.asin(Math.max(-1, Math.min(1, 2 * (a * c - d * b)))) * 180 / Math.PI,
      Math.atan2(2 * (a * d + b * c), 1 - 2 * (c * c + d * d)) * 180 / Math.PI
    ];
  }

  static interpolateAngles(a, b) {
    const i = Versor.interpolate(Versor.fromAngles(a), Versor.fromAngles(b));

    return t => Versor.toAngles(i(t));
  }

  static interpolateLinear([a1, b1, c1, d1], [a2, b2, c2, d2]) {
    a2 -= a1, b2 -= b1, c2 -= c1, d2 -= d1;
    const x = new Array(4);

    return t => {
      const l = Math.hypot(x[0] = a1 + a2 * t, x[1] = b1 + b2 * t, x[2] = c1 + c2 * t, x[3] = d1 + d2 * t);
      x[0] /= l, x[1] /= l, x[2] /= l, x[3] /= l;

      return x;
    };
  }

  static interpolate([a1, b1, c1, d1], [a2, b2, c2, d2]) {
    let dot = a1 * a2 + b1 * b2 + c1 * c2 + d1 * d2;
    if (dot < 0) a2 = -a2, b2 = -b2, c2 = -c2, d2 = -d2, dot = -dot;
    if (dot > 0.9995) return Versor.interpolateLinear([a1, b1, c1, d1], [a2, b2, c2, d2]);

    const theta0 = Math.acos(Math.max(-1, Math.min(1, dot)));
    const x = new Array(4);
    const l = Math.hypot(a2 -= a1 * dot, b2 -= b1 * dot, c2 -= c1 * dot, d2 -= d1 * dot);
    a2 /= l, b2 /= l, c2 /= l, d2 /= l;

    return t => {
      const theta = theta0 * t;
      const s = Math.sin(theta);
      const c = Math.cos(theta);
      x[0] = a1 * c + a2 * s;
      x[1] = b1 * c + b2 * s;
      x[2] = c1 * c + c2 * s;
      x[3] = d1 * c + d2 * s;
      return x;
    };
  }
}

const numberFormatter = Intl.NumberFormat("es-VE")

const VenezuelaId = "862"
const PaisOrigenIdId = VenezuelaId
const PaisShowcaseTime = 20 * 1000;
// Ángulo respecto a la normal del visor
// Original 20 grados
const Tilt = 10;

const MapaSpaceColor = "#090909"
const MapaOceanoColor = "#3b68bb"
const MapaTierraColor = "#698e72"
const MapaBordesColor = "#333"
const MapaPaisSeleccionadoColor = "#DE9408"
const MapaEsferaContornoColor = "#000"
const MapaTravelLineColor = "#000"
const MapaTravelLineWidth = 1.5


const infoEl = document.querySelector(".info")
const selectEl = document.getElementsByTagName("select")[0]

let width = 1024;
let height = Math.min(width, 720);

/**
 * @param {Country[]} countries
 */
async function setupCanvas(land, borders, countries, paisesSeleccionados) {
  // Prepare a canvas.
  const dpr = window.devicePixelRatio ?? 1;


  /** @type {HTMLCanvasElement} */
  const canvas = d3.select("canvas");

  canvas
    .attr("width", dpr * width)
    .attr("height", dpr * height)
    // .style("width", `${width}px`)

  /** @type {CanvasRenderingContext2D} */
  const context = canvas.node().getContext("2d");
  context.scale(dpr, dpr);

  // Create a projection and a path generator.
  const projection = d3.geoOrthographic().fitExtent([[10, 10], [width - 10, height - 10]], { type: "Sphere" });
  const dibujarEnLaEsfera = d3.geoPath(projection, context);

  function renderCountryName(country) {
    context.beginPath(), context.font = "12pt serif", context.fillStyle = "#000", context.fillText(country.properties.name, width / 2, height / 2)
  }

  function render(country, arc) {
    context.clearRect(0, 0, width, height);
    // space
    context.fillStyle = MapaSpaceColor, context.fillRect(0, 0, width, height);

    // water
    context.beginPath(), dibujarEnLaEsfera({ type: "Sphere" }), context.fillStyle = MapaOceanoColor, context.fill();

    // land
    context.beginPath(), dibujarEnLaEsfera(land), context.fillStyle = MapaTierraColor, context.fill();

    // país seleccionado (de haber uno)
    if (country) {
      context.beginPath(), dibujarEnLaEsfera(country), context.fillStyle = MapaPaisSeleccionadoColor, context.fill();
      // renderCountryName(country);
    }

    // bordes de países
    context.beginPath(), dibujarEnLaEsfera(borders), context.strokeStyle = MapaBordesColor, context.lineWidth = 0.5, context.stroke();

    // borde de la esfera
    // context.beginPath(), path({ type: "Sphere" }), context.strokeStyle = MapaEsferaContornoColor, context.lineWidth = 1.5, context.stroke();

    // línea de recorrido
    context.beginPath(), dibujarEnLaEsfera(arc), context.strokeStyle = MapaTravelLineColor, context.lineWidth = MapaTravelLineWidth, context.stroke();

    return context.canvas;
  }



  let puntoInicial, puntoFinal = [0, 0], r1, r2 = [0, 0, 0];
  async function travel(country) {
    console.log("Travel to", country.properties.name, { country });

    render(country);

    puntoInicial = puntoFinal;
    puntoFinal = d3.geoCentroid(country);

    r1 = r2;
    r2 = [-puntoFinal[0], Tilt - puntoFinal[1], 0];
    // geoInterpolate recibe dos puntos a y b (en forma de pares lat, lon) de una esfera y crea una función que recibe un parámetro t entre 0 y 1
    // y retorna el punto que está a esa fracción de distancia entre a y b.
    const interpolatePointFn = d3.geoInterpolate(puntoInicial, puntoFinal);
    const interpolateAngleFn = Versor.interpolateAngles(r1, r2);

    await d3.transition()
      .duration(1250)
      .tween("render", () => t => {
        projection.rotate(interpolateAngleFn(t));
        render(country, { type: "LineString", coordinates: [puntoInicial, interpolatePointFn(t)] });
      })
      .transition()
      .tween("render", () => t => {
        render(country, { type: "LineString", coordinates: [interpolatePointFn(t), puntoFinal] });
      })
      .end();
  }

  // Cargamos los países indicados en el selector
  const countriesMap = {}
  countries.forEach(country => countriesMap[country.id] = country);

  const paisesSeleccionadosMap = {}
  paisesSeleccionados
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .forEach(pais => {
      paisesSeleccionadosMap[pais.id] = pais

      const countryOption = document.createElement('option')
      countryOption.value = pais.id
      countryOption.innerText = pais.nombre

      selectEl.appendChild(countryOption)
    });

  function renderInfo(paisId) {
    const paisInfo = paisesSeleccionadosMap[paisId]

    infoEl.innerHTML = `<h3>${paisInfo.nombre}</h3>
      <dl>
      <dt>Superficie</dt><dd>${numberFormatter.format(paisInfo.superficie)} km<sup>2</sup></dd>
      <dt>Habitantes</dt><dd>${numberFormatter.format(paisInfo.numeroHabitantes)}</dd>
      <dt>Capital</dt><dd>${paisInfo.capital}</dd>
      <dt>Lenguaje(s)</dt><dd>${paisInfo.lenguajes.join(', ')}</dd>
      <dt>Gentilicio(s)</dt><dd>${paisInfo.gentilicio.join(', ')}</dd>
      </dl>
  
      <div class="bandera-wrapper"><img class="bandera" src="banderas/Band_${paisInfo.bandera}.sd.png" alt="Bandera de ${paisInfo.nombre}"></div>`
  }

  // Primer render del mapa
  (function () {
    const paisOrigen = countriesMap[PaisOrigenIdId]
    puntoFinal = d3.geoCentroid(paisOrigen)
    r2 = [-puntoFinal[0], Tilt - puntoFinal[1], 0]

    // El mapa se crea con un centro no adecuado. Debemos rotarlo al sitio adecuado.
    projection.rotate(r2)
    render(paisOrigen)
    renderInfo(PaisOrigenIdId)
  })()

  selectEl.value = PaisOrigenIdId
  selectEl.addEventListener('input', function (ev) {
    console.log("Country selected", { value: selectEl.value })

    selectEl.disabled = true;
    selectEl.ariaReadOnly = true;

    travel(countriesMap[selectEl.value]).then(() => {
      renderInfo(selectEl.value)
      infoEl.classList.remove("hidden");

      return sleep(PaisShowcaseTime)
    })
      .then(() => {
        infoEl.classList.add("hidden");

        // Esperamos a que termine de ocurrir el efecto de transición
        return sleep(500)
      })
      .then(() => {
        selectEl.value = PaisOrigenIdId

        return travel(countriesMap[PaisOrigenIdId])
      })
      .then(() => {
        selectEl.disabled = false;
        selectEl.ariaReadOnly = false;
      })
      .catch(err => console.error(err))
  })

  // window.addEventListener('resize', function() {
  //   console.log("resize")
  //   render()
  // })
}

// const selectEl = null
Promise.all([
  d3.json("paises.json"),
  d3.json("countries-110m.json")
])
  .then(async (payloads) => {
    const paisesSeleccionados = payloads[0], world = payloads[1];

    console.log("contries loaded")

    const countries = topojson.feature(world, world.objects.countries).features
    const borders = topojson.mesh(world, world.objects.countries, (a, b) => a !== b)
    const land = topojson.feature(world, world.objects.land)

    await setupCanvas(land, borders, countries, paisesSeleccionados)
  })