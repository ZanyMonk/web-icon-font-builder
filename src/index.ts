
/* IMPORT */

import * as _ from 'lodash';
import chalk from 'chalk';
import * as del from 'del';
import * as execa from 'execa';
import * as fs from 'fs';
import * as globby from 'globby';
import * as got from 'got';
import * as isUrl from 'is-url';
import * as mkdirp from 'mkdirp';
import * as path from 'path';
import * as svg2font from 'svgicons2svgfont';
import * as temp from 'temp';
import * as ttf2woff2 from 'ttf2woff2';
import copy from './copy';
import exit from './exit';
import makeAbs from './make_abs';

temp.track ();

/* ICON FONT BUILDR */

//TODO: Add support for font ligatures

class IconFontBuildr {

  /* VARIABLES */

  configDefault; config; paths;

  /* CONSTRUCTOR */

  constructor ( config? ) {

    this.configInit ( config );
    this.configCheck ();

  }

  /* CONFIG */

  configInit ( config? ) {

    this.configDefault = {
      sources: [],
      icons: [],
      output: {
        icons: undefined,
        fonts: path.join ( process.cwd (), 'icon_font' ),
        fontName: 'IconFont',
        formats: [
          'eot',
          'ttf',
          'woff',
          'woff2'
        ]
      }
    };

    this.config = _.mergeWith ( {}, this.configDefault, config, ( prev, next ) => _.isArray ( next ) ? next : undefined );

    this.config.sources = this.config.sources.map ( makeAbs );
    this.config.output.icons = makeAbs ( this.config.output.icons );
    this.config.output.fonts = makeAbs ( this.config.output.fonts );

  }

  configCheck () {

    if ( !this.config.sources.length ) exit ( 'You need to provide at least one source, both remote and local sources are supported' );

    const sourceUntokenized = this.config.sources.find ( source => !source.includes ( '[icon]' ) );

    if ( sourceUntokenized ) exit ( `The "${chalk.bold ( sourceUntokenized )}" source doesn't include the "${chalk.bold ( '[icon]' )}" token` );

    if ( !this.config.icons.length ) exit ( 'You need to provide at least one icon' );

    const formats = this.configDefault.output.formats;

    if ( !this.config.output.formats.length ) exit ( `You need to provide at least one format, supported formats: ${formats.map ( format => `"${chalk.bold ( format )}"` ).join ( ', ' )}` );

    const formatUnsupported = this.config.output.formats.find ( format => !formats.includes ( format ) );

    if ( formatUnsupported ) exit ( `The format "${chalk.bold ( formatUnsupported )}" is not supported, supported formats: ${formats.map ( format => `"${chalk.bold ( format )}"` ).join ( ', ' )}` );

    if ( !this.config.output.fontName ) exit ( 'You need to provide a valid font name' );

  }

  /* PATHS */

  pathsInit () {

    const { fonts: fontsDir, fontName } = this.config.output,
          tempDir = temp.mkdirSync ( 'icon-font-buildr' );

    this.paths = {
      cache: {
        root: tempDir,
        icons: this.config.output.icons || path.join ( tempDir, 'icons' ),
        fontSVG: path.join ( tempDir, `${fontName}.svg` ),
        fontTTF: path.join ( tempDir, `${fontName}.ttf` ),
        fontEOT: path.join ( tempDir, `${fontName}.eot` ),
        fontWOFF: path.join ( tempDir, `${fontName}.woff` ),
        fontWOFF2: path.join ( tempDir, `${fontName}.woff2` )
      },
      output: {
        fontSVG: path.join ( fontsDir, `${fontName}.svg` ),
        fontTTF: path.join ( fontsDir, `${fontName}.ttf` ),
        fontEOT: path.join ( fontsDir, `${fontName}.eot` ),
        fontWOFF: path.join ( fontsDir, `${fontName}.woff` ),
        fontWOFF2: path.join ( fontsDir, `${fontName}.woff2` )
      }
    };

    mkdirp.sync ( this.paths.cache.icons );
    mkdirp.sync ( fontsDir );

  }

  pathsReset () {

    del.sync ( this.paths.cache.root, { force: true } );

  }

  /* DOWNLOAD */

  async downloadIcons () {

    const downloaders = [this.downloadIconLocal.bind ( this ), this.downloadIconRemote.bind ( this )];

    await Promise.all ( this.config.icons.map ( async icon => {

      const dst = path.join ( this.paths.cache.icons, `${icon}.svg` );

      let downloaded = false;

      for ( let si = 0, sl = this.config.sources.length; !downloaded && si < sl; si++ ) {

        const srcTokenized = this.config.sources[si],
              src = srcTokenized.replace ( '[icon]', icon );

        for ( let di = 0, dl = downloaders.length; !downloaded && di < dl; di++ ) {

          const downloader = downloaders[di];

          downloaded = await downloader ( src, dst );

        }

      }

      if ( !downloaded ) exit ( `The "${chalk.bold ( icon )}" icon has not been found in any of the sources` );

    }));

  }

  async downloadIconRemote ( src, dst ) {

    if ( !isUrl ( src ) ) return false;

    try {

      const {body} = await got ( src );

      fs.writeFileSync ( dst, body );

      console.log ( `Downloaded "${chalk.bold ( src )}"` );

      return true;

    } catch ( e ) {

      return false;

    }

  }

  downloadIconLocal ( src, dst ) {

    if ( !fs.existsSync ( src ) ) return false;

    copy ( src, dst );

    console.log ( `Copied "${chalk.bold ( src )}"` );

    return true;

  }

  /* ICONS */

  async getIcons () {

    const filePaths = ( await globby ( '*.svg', { cwd: this.paths.cache.icons, absolute: true } ) ).sort (), // Ensuring the order is fixed
          codepointStart = '\uE000', // Beginning of Unicode's private use area
          icons = {};

    filePaths.forEach ( ( filePath, index ) => {

      const name = path.basename ( filePath, path.extname ( filePath ) ),
            codepoint = String.fromCharCode ( codepointStart.charCodeAt ( 0 ) + index ),
            codepointHex = codepoint.charCodeAt ( 0 ).toString ( 16 );

      icons[filePath] = { filePath, name, codepoint, codepointHex };

    });

    return icons;

  }

  async getIconsCodepoints ( hex = false ) {

    const icons = await this.getIcons (),
          values = Object.values ( icons ) as any[]; //TSC

    return values.reduce ( ( acc, icon ) => {

      acc[icon.name] = hex ? icon.codepointHex : icon.codepoint;

      return acc;

    }, {} );

  }

  /* BUILD */

  async build  () {

    this.pathsInit ();

    await this.downloadIcons ();

    await this.buildFontSVG ();
    await this.buildFontTTF ();
    await this.buildFontEOT ();
    await this.buildFontWOFF ();
    await this.buildFontWOFF2 ();

    this.outputFonts ();

    this.pathsReset ();

  }

  async buildFontSVG () {

    const icons = await this.getIcons ();

    const stream = new svg2font ({
      centerHorizontally: true,
      fontHeight: 4096,
      fontName: this.config.output.fontName,
      normalize: true
    });

    stream.pipe ( fs.createWriteStream ( this.paths.cache.fontSVG ) );

    Object.values ( icons ).forEach ( ( icon: any ) => { //TSC

      const glyph: any = fs.createReadStream ( icon.filePath ); //TSC

      glyph.metadata = {
        unicode: [icon.codepoint],
        name: icon.name
      };

      stream.write ( glyph );

    });

    stream.end ();

  }

  async buildFontTTF () {

    await execa ( 'npx', ['svg2ttf', this.paths.cache.fontSVG, this.paths.cache.fontTTF] );

  }

  async buildFontEOT () {

    await execa ( 'npx', ['ttf2eot', this.paths.cache.fontTTF, this.paths.cache.fontEOT] );

  }

  async buildFontWOFF () {

    await execa ( 'npx', ['ttf2woff', this.paths.cache.fontTTF, this.paths.cache.fontWOFF] );

  }

  async buildFontWOFF2 () {

    const ttf = fs.readFileSync ( this.paths.cache.fontTTF ),
          woff2 = ttf2woff2 ( ttf );

    fs.writeFileSync ( this.paths.cache.fontWOFF2, woff2 );

  }

  /* OUTPUT */

  outputFonts () {

    this.config.output.formats.forEach ( format => {

      const src = this.paths.cache[`font${format.toUpperCase ()}`],
            dst = this.paths.output[`font${format.toUpperCase ()}`];

      copy ( src, dst );

    });

  }

}

/* EXPORT */

export default IconFontBuildr;
