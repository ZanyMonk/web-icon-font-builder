const fs = require('fs');
const ejs = require('ejs');
const path = require('path');
const IconFontBuildr = require('./dist');
const { Z_FIXED } = require('zlib');

async function build () {
	const builder = new IconFontBuildr ({
		sources: [
			path.join(__dirname, 'icons', '[icon].svg')
		],
		icons : [
			'user',
			'eye'
		],
		output: {
			icons: path.join(__dirname, 'icons'),
			fonts: path.join(__dirname, 'fonts'),
			fontName: 'icons',
			formats: [
				'eot',
				'ttf',
				'woff',
				'woff2'
			]
		}
	});

	await builder.build();

	const codepoints = builder.getIconsCodepoints();
  const ligatures = builder.getIconsLigatures();

  console.log(codepoints);
  console.log(ligatures);
  console.log(builder.config);
  console.log(builder.getIconsStylesheet());

  const variablesTemplate = `<% for (const name in codepoints) { _%>
$<%= config.prefix %><%= name %>: "\\<%= codepoints[name][0].charCodeAt(0).toString(16) %>";
<% } %>

@font-face {
  font-family: '<%= config.fontName %>';
  src:  url('<%= config.fontsPath + config.fontName + '.eot?' + nonce %>');
  src:  url('<%= config.fontsPath + config.fontName + '.eot?' + nonce + '#iefix' %>') format('embedded-opentype'),
        url('<%= config.fontsPath + config.fontName + '.ttf?' + nonce %>') format('truetype'),
        url('<%= config.fontsPath + config.fontName + '.woff?' + nonce %>') format('woff'),
        url('<%= config.fontsPath + config.fontName + '.woff2?' + nonce %>') format('woff2');
  font-weight: normal;
  font-style: normal;
  font-display: block;
}`

  const stylesTemplate = `@import "variables";

@mixin <%= config.mixinName %> {
  /* use !important to prevent issues with browser extensions that change fonts */
  font-family: '<%= config.fontName %>' !important;
  speak: none;
  font-style: normal;
  font-weight: normal;
  font-variant: normal;
  text-transform: none;
  line-height: 1;

  /* Better Font Rendering =========== */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

[class^="icon-"], [class*=" icon-"] {
  @include <%= config.mixinName %>;
}

<% for (const name in codepoints) { _%>
.<%= config.prefix %><%= name %> {
  &:before {
      content: $<%= config.prefix %><%= name %>;
  }
}
<% } %>`;

  const data = {
    config: {
      mixinName: 'icons-font',
      prefix: 'icon-',
      fontName: builder.config.output.fontName,
      fontsPath: path.relative(__dirname, builder.config.output.fonts) + '/'
    },
    nonce: Math.random().toString(36).substr(2,8),
    codepoints
  };

  let stylesOutputDir = path.join(__dirname, 'styles');
  let variablesPath = path.join(stylesOutputDir, '_variables.scss');
  let stylesPath = path.join(stylesOutputDir, 'styles.scss');

  if (!fs.existsSync(stylesOutputDir)) {
    fs.mkdirSync(stylesOutputDir);
  }

  if (fs.existsSync(variablesPath)) {
    fs.unlinkSync(variablesPath);
  }

  fs.writeFileSync(
    variablesPath,
    ejs.render(variablesTemplate, data)
  );

  if (fs.existsSync(stylesPath)) {
    fs.unlinkSync(stylesPath);
  }

  fs.writeFileSync(
    stylesPath,
    ejs.render(stylesTemplate, data)
  );
}

build();
