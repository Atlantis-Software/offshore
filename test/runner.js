var fs = require('fs');
var path = require('path');
var util = require('util');
process.env.offshorePath = path.join(__dirname, '..');
var TestRunner = require('offshore-adapter-tests');
var Mocha = require('mocha');

var mocha = new Mocha();

(function getTestFiles(dir) {
  files = fs.readdirSync(dir);
  files.forEach(function(file) {
    if (fs.statSync(path.join(dir, file)).isDirectory()) {
      return getTestFiles(path.join(dir, file));
    }
    mocha.addFile(path.join(dir, file));
  });
})(__dirname);

mocha.run(function(failures) {
  if (failures) {
    process.on('exit', function() {
      process.exit(failures);
    });
  } else {
    var adapterName = 'offshore-memory';
    var Adapter = require(adapterName);

    // Grab targeted interfaces from this adapter's `package.json` file:
    var package = {};
    var interfaces = [];
    var features = [];
    try {
        package = require('../node_modules/' + adapterName + '/package.json');
        interfaces = package['offshoreAdapter'].interfaces;
        features = package.offshoreAdapter.features;
    }
    catch (e) {
        throw new Error(
        '\n'+
        'Could not read supported interfaces from "offshore-adapter"."interfaces"'+'\n' +
        'in this adapter\'s `package.json` file ::' + '\n' +
        util.inspect(e)
        );
    }

    console.info('Testing `' + package.name + '`, an offshore adapter.');
    console.info('Running `offshore-adapter-tests` against ' + interfaces.length + ' interfaces...');
    console.info('( ' + interfaces.join(', ') + ' )');
    console.log();

    /**
    * Integration Test Runner
    *
    * Uses the `offshore-adapter-tests` module to
    * run mocha tests against the specified interfaces
    * of the currently-implemented Offshore adapter API.
    */
    new TestRunner({

        // Load the adapter module.
        adapter: Adapter,

        // Default adapter config to use.
        config: {
            schema: false
        },

        // The set of adapter interfaces to test against.
        // (grabbed these from this adapter's package.json file above)
        interfaces: interfaces,
      
        // The set of adapter features to test against.
        // (grabbed these from this adapter's package.json file above)
        features: features,
        
        // Mocha options
        // reference: https://github.com/mochajs/mocha/wiki/Using-mocha-programmatically
        mocha: {
          reporter: 'spec'
        },
        
        mochaChainableMethods: {},
        
        // Return code 1 if any test failed
        failOnError: true
    });

  }

});
