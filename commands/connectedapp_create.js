const path = require('path');
const os = require('os');

const forceUtils = require('../lib/forceUtils.js');
const forge = require('node-forge');
const certs = require('../lib/certs.js');
const fs = require('fs');

(function () {
  'use strict';

  module.exports = {
    topic: 'connectedapp',
    command: 'create',
    description: 'Create a connected app in your org',
    help: 'help text for waw:connectedapp:create',
    flags: [{
        name: 'targetusername',
        char: 'u',
        description: 'username or alias for the target org',
        hasValue: true
      },
      {
        name: 'name',
        char: 'n',
        description: 'connected app name',
        hasValue: true,
        required: true
      },
      {
        name: 'label',
        char: 'l',
        description: 'connected app label',
        hasValue: true,
        required: false
      },
      {
        name: 'certificate',
        char: 'r',
        description: 'create and register a certificate',
        required: false,
        hasValue: false,
        type: 'flag'
      },
      {
        name: 'callbackurl',
        char: 'c',
        description: 'callbackUrl (default is "sfdx://success")',
        hasValue: true,
        required: false
      },
      {
        name: 'description',
        char: 'd',
        description: 'connected app description',
        hasValue: true,
        required: false
      },
      {
        // Basic,Api,Web,Full,Chatter,CustomApplications,RefreshToken,OpenID,CustomPermissions,Wave,Eclair
        name: 'scopes',
        char: 's',
        description: 'scopes separated by commas (defaut: Basic, Api, Web, RefreshToken; valid: Basic, Api, Web, Full, Chatter, CustomApplications, RefreshToken, OpenID, CustomPermissions, Wave, Eclair)',
        hasValue: true,
        required: false
      },
      {
        name: 'contactemail',
        char: 'e',
        description: '',
        hasValue: true,
        required: false
      },
      {
        name: 'canvasUrl',
        char: 'i',
        description: '',
        hasValue: true,
        required: false
      },
      {
        name: 'accessMethod',
        char: 'm',
        description: '',
        hasValue: true,
        required: false
      },
      {
        //'Chatter', 'ChatterFeed', 'MobileNav', 'PageLayout', 'Publisher', 'Visualforce'
        name: 'locations',
        char: 'f',
        description: '',
        hasValue: true,
        required: false
      },
      {
        //PersonalEnabled
        name: 'options',
        char: 'o',
        description: '',
        hasValue: true,
        required: false
      },
      {
        //namespace
        name: 'namespace',
        char: 'p',
        description: '',
        hasValue: true,
        required: false
      }
    ],
    run(context) {

      const targetUsername = context.flags.targetusername;
      const connectedAppName = context.flags.name;
      let connectedAppLabel = context.flags.label;
      let contactEmail = context.flags.contactemail;

      let canvasUrl = context.flags.canvasUrl;
      let accessMethod = context.flags.accessMethod;
      let locations = context.flags.locations;
      let options = context.flags.options;
      let namespace = context.flags.namespace;

      if (context.flags.label === null || context.flags.label === undefined) {
        connectedAppLabel = connectedAppName;
      }

      let callbackurl = context.flags.callbackurl;
      if (!callbackurl) {
        callbackurl = 'sfdx://success';
      }
      const createCerts = context.flags.certificate;
      let appDescription = context.flags.description;
      if (!appDescription) {
        appDescription = 'generated by waw:connectedapp:create';
      }
      const origScopes = context.flags.scopes;
      let appScopes = [];
      if (origScopes) {
        appScopes = origScopes.split(',');
      } else {
        appScopes = ['Basic', 'Api', 'Web', 'RefreshToken'];
      }

      let canvasConfig = {};
      if (canvasUrl != null){
        canvasConfig.canvasUrl = canvasUrl;
        canvasConfig.accessMethod = accessMethod;
        canvasConfig.locations = locations.split(',');
        canvasConfig.options = options.split(',');
      }

      const generatedConsumerSecret = forceUtils.getConsumerSecret();

      forceUtils.getOrg(targetUsername, (org) => {

        const pki = forge.pki;
        const keys = pki.rsa.generateKeyPair(2048);
        const privKey = forge.pki.privateKeyToPem(keys.privateKey);
        contactEmail = contactEmail || org.getName();

        certs.getSelfSignedCertificate(pki, keys, (cert) => {

          let pubKey;

          if (createCerts) {
            pubKey = pki.certificateToPem(cert);

            fs.writeFile('server.key', privKey, (err) => {
              if (err) {
                return console.log(err); // eslint-disable-line no-console
              }
            });

            fs.writeFile('server.crt', pubKey, (err) => {
              if (err) {
                return console.log(err); // eslint-disable-line no-console
              }
            });
          }

          org.force._getConnection(org, org.config).then((conn) => {

            let metadata;

            if (createCerts) {
              metadata = [{
                contactEmail,
                description: appDescription,
                fullName: connectedAppName,
                label: connectedAppLabel,
                oauthConfig: {
                  callbackUrl: callbackurl,
                  consumerSecret: generatedConsumerSecret,
                  certificate: pubKey,
                  scopes: appScopes
                }
              }];
            } else {
              metadata = [{
                contactEmail,
                description: appDescription,
                fullName: connectedAppName,
                label: connectedAppLabel,
                oauthConfig: {
                  callbackUrl: callbackurl,
                  consumerSecret: generatedConsumerSecret,
                  scopes: appScopes
                }
              }];
            }
            if (canvasUrl != null){
              metadata[0]['canvasConfig'] = canvasConfig;
            }

            conn.metadata.create('ConnectedApp', metadata, (createErr, results) => {
              if (createErr) {
                console.log(createErr);
              } else if (results.success) {
                if (namespace != null){
                  connectedAppName = namespace + '__' + connectedAppName;
                }
                conn.metadata.read('ConnectedApp', connectedAppName, (readErr, metadataResult) => {
                  if (readErr) {
                    console.log(readErr);
                  } else {
                    metadataResult.oauthConfig.consumerSecret = generatedConsumerSecret;

                    console.log(JSON.stringify(metadataResult)); // eslint-disable-line no-console
                    // console.log('secret', generatedConsumerSecret);
                  }
                });
              } else {
                console.log(results); // eslint-disable-line no-console
              }
            });
          });
        });
      });
    }
  };
}());