const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// 🔐 Thông tin Amazon PAAPI
const accessKey = 'YOUR_ACCESS_KEY';
const secretKey = 'YOUR_SECRET_KEY';
const partnerTag = 'YOUR_ASSOCIATE_TAG';
const region = 'us-east-1';
const host = 'webservices.amazon.com';
const endpoint = `https://${host}/paapi5/getitems`;

function sign(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest();
}

function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = sign(`AWS4${key}`, dateStamp);
  const kRegion = sign(kDate, regionName);
  const kService = sign(kRegion, serviceName);
  const kSigning = sign(kService, 'aws4_request');
  return kSigning;
}

function getSignedHeaders(payload) {
  const method = 'POST';
  const service = 'ProductAdvertisingAPI';
  const contentType = 'application/json; charset=UTF-8';
  const amzTarget = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems';

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);

  const canonicalUri = '/paapi5/getitems';
  const canonicalQuerystring = '';
  const canonicalHeaders = `content-encoding:\ncontent-type:${contentType}\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:${amzTarget}\n`;
  const signedHeaders = 'content-encoding;content-type;host;x-amz-date;x-amz-target';

  const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/ProductAdvertisingAPI/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const signingKey = getSignatureKey(secretKey, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorizationHeader =
    `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    'Content-Encoding': '',
    'Content-Type': contentType,
    'X-Amz-Date': amzDate,
    'X-Amz-Target': amzTarget,
    Authorization: authorizationHeader,
    Host: host,
  };
}

// 🔄 Route nhận request từ Apps Script
app.post('/amazon/lookup', async (req, res) => {
  const { asin, marketplace } = req.body;
  const payloadObject = {
    ItemIds: [asin],
    Resources: ['SimilarProducts'],
    PartnerTag: partnerTag,
    PartnerType: 'Associates',
    Marketplace: marketplace || 'www.amazon.com',
  };

  const payload = JSON.stringify(payloadObject);
  const headers = getSignedHeaders(payload);

  try {
    const response = await axios.post(endpoint, payload, { headers });
    res.json(response.data.ItemsResult.Items[0]);
  } catch (error) {
    console.error('Error calling PAAPI:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to call Amazon API' });
  }
});

// 🔐 Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Amazon PAAPI server running on port ${PORT}`));
