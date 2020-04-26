import svelte from "rollup-plugin-svelte";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
//import livereload from "rollup-plugin-livereload";
import {terser} from "rollup-plugin-terser";
//import postcss from "rollup-plugin-postcss";
import svelte_preprocess_postcss from 'svelte-preprocess-postcss';
import css from 'rollup-plugin-css-only'

const production = !process.env.ROLLUP_WATCH;

export default [{
  input: "src/svelte/reservationsMachines/main.js",
  output: {
    sourcemap: true,
    format: "iife",
    name: "app",
    file: "src/eleventy/_includes/js/bundle.js"
  },
  plugins: [
    css({ output: 'src/eleventy/css/reservationsMachines.css' }),
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
    resolve({
      browser: false,
      dedupe: importee => importee === "svelte" || importee.startsWith("svelte/")
    }),
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
    clearScreen: false
  }
},
{
  input: "src/svelte/inscriptions/main.js",
  output: {
    sourcemap: true,
    format: "iife",
    name: "appInscription",
    file: "src/eleventy/_includes/js/inscriptionAteliers.js"
  },
  plugins: [
    svelte({
      customElement: true,
      // enable run-time checks when not in production
      dev: !production,
      // different de l'app normale pour prendre en compte tailwind dans le composant web
      preprocess: {
        style: svelte_preprocess_postcss(),
     },
      // we'll extract any component CSS out into
      // a separate file — better for performance
      css: css => {
        css.write("src/eleventy/_includes/css/svelte/inscriptionAteliers.css");
      }
    }),
    // If you have external dependencies installed from
    // npm, you'll most likely need these plugins. In
    // some cases you'll need additional configuration —
    // consult the documentation for details:
    // https://github.com/rollup/plugins/tree/master/packages/commonjs
    resolve({
      browser: false
    }),
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
    clearScreen: false
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
