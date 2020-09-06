import svelte from "rollup-plugin-svelte";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import {terser} from "rollup-plugin-terser";

const production = !process.env.ROLLUP_WATCH;

export default [{
  input: "src/svelte/reservationsMachines/main.js",
  output: {
    sourcemap: true,
    format: "iife",
    name: "app",
    file: "./dist/js/reservationsMachines.js"
  },
  plugins: [
    //css({ output: 'src/eleventy/css/reservationsMachines.css' }),
    svelte({
      // enable run-time checks when not in production
      dev: !production,
      // we'll extract any component CSS out into
      // a separate file — better for performance
      /*css: css => {
        css.write("src/eleventy/css/resaMachinesAddOn.css");
      } */
    }),
    // If you have external dependencies installed from
    // npm, you'll most likely need these plugins. In
    // some cases you'll need additional configuration —
    // consult the documentation for details:
    // https://github.com/rollup/plugins/tree/master/packages/commonjs
    resolve(),
    commonjs({include: ["node_modules/**"]}),
    // In dev mode, call `npm run start` once
    // the bundle has been generated
    //!production && serve(),

    // Watch the `public` directory and refresh the
    // browser on changes when not in production
    //!production && livereload("public"),

    // If we're building for production (npm run build
    // instead of npm run dev), minify
    production && terser()
  ],
  watch: {
    //usePolling: true,
    //clearScreen: false
  }
},
{
  input: "src/svelte/inscriptions/main.js",
  output: {
    sourcemap: true,
    format: "iife",
    name: "appInscription",
    file: "./dist/js/inscriptionAteliers.js"
  },
  plugins: [
    svelte({
      customElement: true,
      // enable run-time checks when not in production
      dev: !production,
      // different de l'app normale pour prendre en compte tailwind dans le composant web
      /* preprocess: sveltePreprocess({
        sourceMap: !production,
        postcss: {
            plugins: [
                require("postcss-import"),
                require("tailwindcss"),
                require("autoprefixer"),
                ...(process.env.NODE_ENV === "production"
                ? [purgecss, require("cssnano")]
                : [])
            ]
        }
      }),*/
      // we'll extract any component CSS out into
      // a separate file — better for performance
      //css: css => {
      //  css.write("src/eleventy/_includes/css/svelte/inscriptionAteliers.css");
      //}
    }),
    // If you have external dependencies installed from
    // npm, you'll most likely need these plugins. In
    // some cases you'll need additional configuration —
    // consult the documentation for details:
    // https://github.com/rollup/plugins/tree/master/packages/commonjs
    resolve(),
    commonjs({include: ["node_modules/**"]}),
    // In dev mode, call `npm run start` once
    // the bundle has been generated
    //!production && serve(),

    // Watch the `public` directory and refresh the
    // browser on changes when not in production
    //!production && livereload("public"),

    // If we're building for production (npm run build
    // instead of npm run dev), minify
    production && terser()
  ],
  watch: {
    //usePolling: true,
    //clearScreen: false
  }
}];

function serve() {
  let started = false;

  return {
    writeBundle() {
      if (!started) {
        started = true;

        require("child_process").spawn("npm", ["run", "start", "--", "--dev"], {
          stdio: ["ignore", "inherit", "inherit"],
          shell: true
        });
      }
    }
  };
}
