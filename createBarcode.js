import AWS from 'aws-sdk';
import bwipjs from 'bwip-js';

const s3 = new AWS.S3({
  region: 'ap-southeast-2',
});

const db = new AWS.DynamoDB.DocumentClient({
  region: 'us-east-1',
});

async function generateBarcodeBuffer(barcodeID) {
  return new Promise((resolve) => {
    bwipjs.toBuffer(
      {
        bcid: 'code128', // Barcode type
        text: barcodeID,
        scale: 2, // 3x scaling factor
        height: 20, // Bar height, in millimeters
        paddingwidth: 10,
        paddingheight: 10,
        backgroundcolor: 'FFFFFF',
      },
      (err, png) => {
        if (err) {
          // Decide how to handle the error
          // `err` may be a string or Error object
        } else {
          resolve(png);
        }
      },
    );
  });
}

async function uploadBarcode(barcodeID, barcodeBuffer) {
  await s3
    .putObject({
      Bucket: 'tfyc-barcodes',
      Key: `${barcodeID}.png`,
      Body: barcodeBuffer,
      ACL: 'public-read',
    })
    .promise();
}

function generateBarcodeID() {
  const number = Math.floor(Math.random() * 90000000) + 10000000;
  return `FYCB${number}`;
}

export default async function (psid) {
  const barcodeID = generateBarcodeID();

  await db
    .put({
      TableName: 'Barcodes',
      Item: {
        psid,
        createdAt: new Date().getTime(),
        barcodeID,
      },
    })
    .promise();

  const barcodeBuffer = await generateBarcodeBuffer(barcodeID);

  await uploadBarcode(barcodeID, barcodeBuffer);

  return `https://s3-ap-southeast-2.amazonaws.com/tfyc-barcodes/${barcodeID}.png`;
}
