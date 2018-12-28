var fs = require('fs');

var gulp = require('gulp');
var requirejs = require('requirejs');
var vinylPaths = require('vinyl-paths');
var del = require('del');
var minifyCss = require('gulp-minify-css');
var runSequence = require('run-sequence');
var merge = require('merge-stream');
var es = require('event-stream');
var hash = require('gulp-hash');
var extend = require('gulp-extend');
var replace = require('gulp-replace');
var rename = require("gulp-rename");

var production = process.env.NODE_ENV === 'production';
var configJsonPath = './config/build-config.json';

gulp.task('build', function(callback) {
    runSequence(
        'clean:build',

        ['minify-js-clam', 'minify-css-clam', 'copy:assets-clam', 'minify-js-btc', 'minify-css-btc', 'copy:assets-btc'],
        'hash-files-clam',
        'hash-files-btc',

        callback
    );
});

/** Delete build folder and config file if exist **/
gulp.task('clean:build', function () {
    var buildStream = gulp.src('build')
        .pipe(vinylPaths(del));

    var configStream = gulp.src('config/build-config.json')
        .pipe(vinylPaths(del));

    return merge(buildStream, configStream);
});



/** RequireJS Optimizer options **/
var clamClientOptions = {
    baseUrl: './client_clam/scripts',
    out: './build/scripts/main-clam.js',
    name: '../../node_modules/almond/almond',
    mainConfigFile: './client_clam/scripts/main.js',
    include: 'main',
    insertRequire: ['main'],
    removeCombined: false,
    optimize: "uglify2", //none
    generateSourceMaps: false, //TODO: true
    preserveLicenseComments: false
};


var btcClientOptions = {
    baseUrl: './client_btc/scripts',
    out: './build/scripts/main-btc.js',
    name: '../../node_modules/almond/almond',
    mainConfigFile: './client_btc/scripts/main.js',
    include: 'main',
    insertRequire: ['main'],
    removeCombined: false,
    optimize: "uglify2", //none
    generateSourceMaps: false, //TODO: true
    preserveLicenseComments: false
};


/** Minify the Javascript with requireJs optizer **/
gulp.task('minify-js-clam', function(callback) {
    requirejs.optimize(clamClientOptions, function (buildResponse) {
        callback();

    }, function(err) {
        callback(err);
        console.error('[Error on require optimization]: ', err);
    });
});


/** Minify the Javascript with requireJs optizer **/
gulp.task('minify-js-btc', function(callback) {
    requirejs.optimize(btcClientOptions, function (buildResponse) {
        callback();

    }, function(err) {
        callback(err);
        console.error('[Error on require optimization]: ', err);
    });
});



/** Minify game and landing css into build dir **/
gulp.task('minify-css-clam', function() {

    //Game css
    var appStream = gulp.src('client_clam/css/game.css')
        .pipe(minifyCss({ advanced: false, aggressiveMerging: false, restructuring: false, shorthandCompacting: false }))
        .pipe(rename('css/game-clam.css'))
        .pipe(gulp.dest('build/'));

    //Game white theme css
    var themeStream = gulp.src('client_clam/css/blackTheme.css')
        .pipe(minifyCss({ compatibility: 'ie8' }))
        .pipe(rename('css/game-theme-clam.css'))
        .pipe(gulp.dest('build/'));

    //Landing css
    var landingStream = gulp.src('client_clam/css/app.css')
        .pipe(minifyCss({ compatibility: 'ie8' }))
        .pipe(rename('css/app-clam.css'))
        .pipe(gulp.dest('build/'));

    return merge(appStream, landingStream, themeStream);
});

/** Minify game and landing css into build dir **/
gulp.task('minify-css-btc', function() {

    //Game css
    var appStream = gulp.src('client_btc/css/game.css')
        .pipe(minifyCss({ advanced: false, aggressiveMerging: false, restructuring: false, shorthandCompacting: false }))
        .pipe(rename('css/game-btc.css'))
        .pipe(gulp.dest('build/'));

    //Game white theme css
    var themeStream = gulp.src('client_btc/css/blackTheme.css')
        .pipe(minifyCss({ compatibility: 'ie8' }))
        .pipe(rename('css/game-theme-btc.css'))
        .pipe(gulp.dest('build/'));

    //Landing css
    var landingStream = gulp.src('client_btc/css/app.css')
        .pipe(minifyCss({ compatibility: 'ie8' }))
        .pipe(rename('css/app-btc.css'))
        .pipe(gulp.dest('build/'));

    return merge(appStream, landingStream, themeStream);
});




/** Copy the files to prod folder **/
gulp.task('copy:assets-clam', function() {
    return gulp.src('client_clam/**/*.*')
        .pipe(gulp.dest('build/'));
});

/** Hash the config.js and the app.css files  **/
var hashOptions = {
    template: '<%= name %>-<%= hash %><%= ext %>'
};
gulp.task('hash-files-clam', function(callback) {
    runSequence('hash-css-game-clam', 'hash-css-game-theme-clam', 'hash-css-app-clam', 'hash-js-clam', callback);
});

gulp.task('hash-css-game-clam', function() {
    return addToManifest(
        gulp.src('./build/css/game-clam.css')
            .pipe(hash(hashOptions))
            .pipe(gulp.dest('build/css'))
    );
});

gulp.task('hash-css-game-theme-clam', function() {
    return addToManifest(
        gulp.src('./build/css/game-theme-clam.css')
            .pipe(hash(hashOptions))
            .pipe(gulp.dest('build/css'))
    );
});

gulp.task('hash-css-app-clam', function() {
    return addToManifest(
        gulp.src('./build/css/app-clam.css')
            .pipe(hash(hashOptions))
            .pipe(gulp.dest('build/css'))
    );
});

gulp.task('hash-js-clam', function() {
    return addToManifest(
        gulp.src('./build/scripts/main-clam.js')
            .pipe(hash(hashOptions))
            .pipe(gulp.dest('build/scripts'))
    );
});







/** Copy the files to prod folder **/
gulp.task('copy:assets-btc', function() {
    return gulp.src('client_btc/**/*.*')
        .pipe(gulp.dest('build/'));
});

/** Hash the config.js and the app.css files  **/
var hashOptions = {
    template: '<%= name %>-<%= hash %><%= ext %>'
};

gulp.task('hash-files-btc', function(callback) {
    runSequence('hash-css-game-btc', 'hash-css-game-theme-btc', 'hash-css-app-btc', 'hash-js-btc', callback);
});

gulp.task('hash-css-game-btc', function() {
    return addToManifest(
        gulp.src('./build/css/game-btc.css')
            .pipe(hash(hashOptions))
            .pipe(gulp.dest('build/css'))
    );
});

gulp.task('hash-css-game-theme-btc', function() {
    return addToManifest(
        gulp.src('./build/css/game-theme-btc.css')
            .pipe(hash(hashOptions))
            .pipe(gulp.dest('build/css'))
    );
});

gulp.task('hash-css-app-btc', function() {
    return addToManifest(
        gulp.src('./build/css/app-btc.css')
            .pipe(hash(hashOptions))
            .pipe(gulp.dest('build/css'))
    );
});

gulp.task('hash-js-btc', function() {
    return addToManifest(
        gulp.src('./build/scripts/main-btc.js')
            .pipe(hash(hashOptions))
            .pipe(gulp.dest('build/scripts'))
    );
});



///** Get the hashed file names of config.js and app.css **/
//var configFile = null;
//gulp.task('get-file-names', function (callback) {
//    fs.readFile('./build/build-config.json', function(err, data) {
//        if (err)
//            return callback(err);
//
//        configFile = JSON.parse(data);
//        callback();
//    });
//});


///** RequireJs Optimizer does not support an option to hash the name of the file, so we need to hash it and then replace the name of the source maps **/
//gulp.task('replace-maps-name', function(){
//
//    var replaceStream = gulp.src('./build/scripts/' + configFile['config.js'], { base: './' })
//        .pipe(replace('sourceMappingURL=config.js', 'sourceMappingURL=' + configFile['config.js']))
//        .pipe(replace('sourceMappingURL=config.js.map', 'sourceMappingURL=' + configFile['config.js'] + '.map'))
//        .pipe(gulp.dest('./'));
//
//    var mapStream = gulp.src('./build/scripts/config.js.map')
//        .pipe(rename('scripts/'+ configFile['config.js'] + '.map'))
//        .pipe(gulp.dest('./build'));
//
//    return merge(replaceStream, mapStream);
//});




/** ======================================== Functions ========================================= **/
/** ============================================================================================ **/

// Adds the files in `srcStream` to the manifest file, extending the manifest's current contents.
function addToManifest(srcStream) {
    return es.concat(
        gulp.src(configJsonPath),
        srcStream
            .pipe(hash.manifest(configJsonPath))
    )
        .pipe(extend(configJsonPath, false, 4))
        .pipe(gulp.dest('.'));
}
