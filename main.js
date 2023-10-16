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


const VenezuelaId = "862"


const PaisOrigenIdId = VenezuelaId
const PaisShowcaseTime = 2000;
// Ángulo respecto a la normal del visor
// Original 20 grados
const Tilt = 10;

const MapaTierraColor = "#ccc"
const MapaBordesColor = "#fff"
const MapaPaisSeleccionadoColor = "#f00"
const MapaEsferaContornoColor = "#000"

/**
 * @param {HTMLSelectElement} selectEl 
 */
async function draw(width, land, borders, countries, selectEl) {
  // Specify the chart’s dimensions.
  const height = Math.min(width, 720); // Observable sets a responsive *width*

  // Prepare a canvas.
  const dpr = window.devicePixelRatio ?? 1;
  const canvas = d3.select("canvas")
    .attr("width", dpr * width)
    .attr("height", dpr * height)
    .style("width", `${width}px`);
  const context = canvas.node().getContext("2d");
  context.scale(dpr, dpr);

  // Create a projection and a path generator.
  const projection = d3.geoOrthographic().fitExtent([[10, 10], [width - 10, height - 10]], { type: "Sphere" });
  const path = d3.geoPath(projection, context);
  const tilt = Tilt;

  function render(country, arc) {
    context.clearRect(0, 0, width, height);
    context.beginPath(), path(land), context.fillStyle = MapaTierraColor, context.fill();
    context.beginPath(), path(country), context.fillStyle = MapaPaisSeleccionadoColor, context.fill();
    context.beginPath(), path(borders), context.strokeStyle = MapaBordesColor, context.lineWidth = 0.5, context.stroke();
    context.beginPath(), path({ type: "Sphere" }), context.strokeStyle = MapaEsferaContornoColor, context.lineWidth = 1.5, context.stroke();
    context.beginPath(), path(arc), context.stroke();

    return context.canvas;
  }

  let puntoInicial, puntoFinal = [0, 0], r1, r2 = [0, 0, 0];
  async function travel(country) {
    console.log(country.properties.name);

    render(country);

    puntoInicial = puntoFinal;
    puntoFinal = d3.geoCentroid(country);

    r1 = r2;
    r2 = [-puntoFinal[0], tilt - puntoFinal[1], 0];
    // geoInterpolate recibe dos puntos a y b (en forma de pares lat, lon) de una esfera y crea una función que recibe un parámetro t entre 0 y 1
    // y retorna el punto que está a esa fracción de distancia entre a y b.
    const interpolatedPoint = d3.geoInterpolate(puntoInicial, puntoFinal);
    const iv = Versor.interpolateAngles(r1, r2);

    await d3.transition()
      .duration(1250)
      .tween("render", () => t => {
        projection.rotate(iv(t));
        render(country, { type: "LineString", coordinates: [puntoInicial, interpolatedPoint(t)] });
      })
      .transition()
      .tween("render", () => t => {
        render(country, { type: "LineString", coordinates: [interpolatedPoint(t), puntoFinal] });
      })
      .end();
  }

  // Cargamos los países indicados en el selector
  const countriesMap = {}
  countries.forEach(country => {
    countriesMap[country.id] = country

    const countryOption = document.createElement('option')
    countryOption.value = country.id
    countryOption.innerText = country.properties.name

    selectEl.appendChild(countryOption)
  });

  // Primer render del mapa
  (function () {
    const paisOrigen = countriesMap[PaisOrigenIdId]
    const p0 = d3.geoCentroid(paisOrigen)

    // El mapa se crea con un centro no adecuado. Debemos rotarlo al sitio adecuado.
    projection.rotate([-p0[0], -p0[1], 0])
    render()
  })()

  selectEl.addEventListener('input', function (ev) {
    // console.log({value: selectEl.value})
    selectEl.disabled = true;
    selectEl.ariaReadOnly = true;

    travel(countriesMap[selectEl.value]).then(() => {
      return new Promise((resolve) => {
        const regresarVenezuela = function () {
          selectEl.disabled = false;
          selectEl.ariaReadOnly = false;

          resolve(travel(countriesMap[PaisOrigenIdId]))
        }

        setTimeout(regresarVenezuela, PaisShowcaseTime)
      })
    })
      .catch(err => console.error(err))
  })
}

const selectEl = document.getElementsByTagName("select")[0]
// const selectEl = null

d3.json("countries-110m.json").then(async world => {
  console.log("contries loaded")

  const countries = topojson.feature(world, world.objects.countries).features
  // console.log({countries})

  const borders = topojson.mesh(world, world.objects.countries, (a, b) => a !== b)
  const land = topojson.feature(world, world.objects.land)

  await draw(1024, land, borders, countries, selectEl)
})
