
import { flags, SfdxCommand } from '@salesforce/command';
import { Messages } from '@salesforce/core';
import { set } from '@salesforce/kit';
import { writeFile } from 'fs-extra';
import { MetadataInfo, SaveResult } from 'jsforce';
import * as forge from 'node-forge';
import { getSelfSignedCertificate } from '../../../lib/certs';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('sfdx-waw-plugin', 'waw');

export default class ConnectedAppCreate extends SfdxCommand {
  public static description = messages.getMessage('connectedapp.create.description');
  public static examples = [];

  public static readonly flagsConfig = {
    name: flags.string({
      char: 'n',
      description: messages.getMessage('connectedapp.create.flags.name'),
      required: true
    }),
    label: flags.string({
      char: 'l',
      description: messages.getMessage('connectedapp.create.flags.label')
    }),
    certificate: flags.boolean({
      char: 'r',
      description: messages.getMessage('connectedapp.create.flags.certificate')
    }),
    callbackurl: flags.string({
      char: 'c',
      description: messages.getMessage('connectedapp.create.flags.callbackurl')
    }),
    description: flags.string({
      char: 'd',
      description: messages.getMessage('connectedapp.create.flags.description')
    }),
    scopes: flags.string({
      // Basic,Api,Web,Full,Chatter,CustomApplications,RefreshToken,OpenID,CustomPermissions,Wave,Eclair
      char: 's',
      description: messages.getMessage('connectedapp.create.flags.scopes')
    }),
    contactemail: flags.string({
      char: 'e',
      description: messages.getMessage('connectedapp.create.flags.contactemail')
    })
  };

  protected static requiresUsername = true;

  public async run(): Promise<SaveResult | MetadataInfo> {
    const username = this.org.getUsername();
    const fullName = this.flags.name;
    const label = this.flags.label || fullName;
    const contactEmail = this.flags.contactemail || username;
    const callbackUrl = this.flags.callbackurl || 'sfdx://success';
    const createCerts = this.flags.certificate;
    const description = this.flags.description || 'generated by waw:connectedapp:create';
    const scopes = this.flags.scopes && this.flags.scope.split(',') || ['Basic', 'Api', 'Web', 'RefreshToken'];

    const consumerSecret = this.getConsumerSecret();

    const metadata = [{
      contactEmail,
      description,
      fullName,
      label,
      oauthConfig: { callbackUrl, consumerSecret, scopes }
    }];

    if (createCerts) {
      const pubKey = await this.generateCert(consumerSecret);
      metadata[0].oauthConfig['certificate'] = pubKey;
    }
    const app = await this.createConnectedApp(metadata);
    set(app, 'oauthConfig.consumerSecret', consumerSecret);
    this.ux.styledJSON(app);
    return app;
  }

  private async generateCert(generatedConsumerSecret: string) {
    const pki = forge.pki;
    const keys = pki.rsa.generateKeyPair(2048);
    const privKey = forge.pki.privateKeyToPem(keys.privateKey);

    const cert = getSelfSignedCertificate(pki, keys);
    const pubKey = pki.certificateToPem(cert);
    await writeFile('server.key', privKey);
    await writeFile('server.crt', pubKey);
    return pubKey;
  }

  private async createConnectedApp(metadata): Promise<SaveResult | MetadataInfo> {
    const conn = this.org.getConnection();
    const results = await conn.metadata.create('ConnectedApp', metadata) as SaveResult;
    if (results.success) {
      return (await conn.metadata.read('ConnectedApp', results.fullName) as MetadataInfo);
    }
    return results;
  }

  private getConsumerSecret() {
    let generatedConsumerSecret = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let i = 0; i < 32; i++) {
        generatedConsumerSecret += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return generatedConsumerSecret;
  }
}