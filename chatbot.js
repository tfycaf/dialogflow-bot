// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues

import fetch from 'node-fetch';
import AWS from 'aws-sdk';
import { v4 } from 'uuid';
import createBarcode from './createBarcode';

const db = new AWS.DynamoDB.DocumentClient({
  region: 'us-east-1',
});

const PAGE_ACCESS_TOKEN = 'EAACZBYlTaAHEBAFimwhmtyWNvqhneqgWSizbcvkDTasi9zAWlaNvhs1DOsCg93GVrxqb0uBNZABfrZAL3wTB4j9RlmI9cElhifENM1dHKaPZAbKoPDJkVdJOsvEYtWHOjtCpmVaRQ0BUABFCtZA7sc3LVut3pmQn3Y4JibZAqgUAvSZB4p9ifJZB';

function getProfile(psid) {
  const URL = `https://graph.facebook.com/v2.6/${psid}?fields=first_name,last_name,profile_pic&access_token=${PAGE_ACCESS_TOKEN}`;
  return fetch(URL).then(res => res.json());
}

function getPSID(request) {
  try {
    return request.originalDetectIntentRequest.payload.data.sender.id;
  } catch (e) {
    return '1672896329491888'; // EVERYBODY IS NELSON!
  }
}

async function createConversation(request) {
  const psid = getPSID(request);
  const timeStamp = new Date().toISOString();

  const p = await getProfile(psid);
  console.log('Retrieved profile for user', p);
  const name = p.first_name;

  await db
    .put({
      TableName: 'Conversations',
      Item: {
        psid,
        state: 'GET_STARTED',
        createdAt: timeStamp,
        name,
      },
    })
    .promise();

  console.log(`Persited conversation with psid ${psid} to database`);

  const { session } = request;

}

function updateState(stateName) {
  return async (request) => {
    const psid = getPSID(request);
    console.log(`Setting ${psid} to ${stateName}`);

    await db
      .update({
        TableName: 'Conversations',
        Key: { psid },
        UpdateExpression: 'set #s = :s',
        ExpressionAttributeNames: {
          '#s': 'state',
        },
        ExpressionAttributeValues: {
          ':s': stateName,
        },
      })
      .promise();

    console.log('Done.');
  };
}

async function addFeedback(psid, type, payload) {
  console.log(`Adding feedback with type ${type} and payload ${payload} for ${psid}`);
  await db
    .put({
      TableName: 'Feedback',
      Item: {
        id: v4(),
        psid,
        type,
        payload,
        createdAt: new Date().toISOString(),
      },
    })
    .promise();

  console.log('Done');
}

async function foodRatingHandler(request) {
  const {
    queryResult: { parameters },
  } = request;
  const p = parameters;

  console.log('Executing foodRatingHandler');
  let foodRating;
  const psid = getPSID(request);

  if (p.thumbsdown) {
    foodRating = '0';
  } else if (p.thumbsup) {
    foodRating = '1';
  } else if (p.onehundred) {
    foodRating = '2';
  } else {
    console.log('Could not get feedback. Params were: ', JSON.stringify(p));
    throw new Error('Unable to collect correct feedback');
  }

  await updateState('GET_VEGAN_FEEDBACK')(request);
  await addFeedback(psid, 'FOOD_REACTION', foodRating);
}

async function veganRatingHandler(request) {
  const {
    queryResult: { parameters },
  } = request;
  const p = parameters;
  let veganRating;

  console.log('Vegan rating function here');
  const psid = getPSID(request);

  if (p.yesvegan) {
    veganRating = 'Yes';
    console.log('They knew it was Vegan');
  } else if (p.novegan) {
    veganRating = 'No';
    console.log("They didn't know it was vegan");
  } else {
    console.log('Vegan rating function has an error');
  }

  await updateState('GET_INTEREST_IN_FOOD')(request);
  await addFeedback(psid, 'VEGAN_REACTION', veganRating);
  const barcodeImageURL = await createBarcode(psid);

  return {
    fulfillmentMessages: [
      {
        platform: 'FACEBOOK',
        text: {
          text: [
            "Want to try this burger for real? Just take this barcode to any Lord of the Fries in the next 7 days and you'll get FREE FRIES with your Premium Chick'n Burger!",
          ],
        },
      },
      {
        platform: 'FACEBOOK',
        card: {
          title: "Get FREE fries with a Premium Chick'n Burger at Lord of the Fries",
          imageUri: barcodeImageURL,
          buttons: [
            {
              text: 'Get Discount',
              postback: barcodeImageURL,
            },
          ],
        },
      },
      {
        platform: 'FACEBOOK',
        quickReplies: {
          title: 'Want us to let you know next time we have more free food?',
          quickReplies: ['Nope', 'Obviously'],
        },
      },
    ],
  };
}

async function moreFoodHandler(request) {
  const {
    queryResult: { parameters },
  } = request;
  const p = parameters;
  let foodNotification;
  const psid = getPSID(request);
  console.log('PSID is ', psid);

  if (p.morefood) {
    foodNotification = 'Yes';
    console.log('Yay they want more!');
  } else if (p.nomorefood) {
    foodNotification = 'No';
    console.log('Sad, they dont want food');
  } else {
    console.error('More food function has an error');
    throw new Error('Cannot collect response from params + ', JSON.stringify(p));
  }

  await updateState('DONE')(request);
  await addFeedback(psid, 'INTERESTED_IN_FOOD', foodNotification);
}

const intentMap = {
  'Default Welcome Intent': createConversation,
  'BotPathway.main.yes': updateState('GET_FOOD_FEEDBACK'),
  'BotPathway.main.no': updateState('GET_FOOD_FEEDBACK'),
  '2b.thumbsdown': foodRatingHandler,
  '2a.thumbsupand100': foodRatingHandler,
  '3b.noadd': veganRatingHandler,
  '3a.discounts': veganRatingHandler,
  '4b.badend': moreFoodHandler,
  '4b.goodend': moreFoodHandler,
  '4a.goodendi': moreFoodHandler,
  '4b.Badendi': moreFoodHandler,
};

const extractIntent = body => body.queryResult.intent.displayName;

const handleRequest = async (request) => {
  try {
    const body = JSON.parse(request.body);
    const intent = extractIntent(body);

    console.log(`Handling intent ${intent} with ${JSON.stringify(body)}`);

    const response = (await intentMap[intent](body)) || {};
    console.log('Responding with: %j', response);
    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (e) {
    console.error('Error handling request', request);
    console.error(e);
    return {
      statusCode: 500,
      body: JSON.stringify(e),
    };
  }
};

export const handler = event => handleRequest(event);
