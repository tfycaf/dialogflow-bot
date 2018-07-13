// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues

import fetch from 'node-fetch';
import AWS from 'aws-sdk';

const db = new AWS.DynamoDB.DocumentClient({
  region: 'us-east-1',
});

const PAGE_ACCESS_TOKEN = 'EAADAuC53U2kBAIHqd4uSNvhghEC7YKU8Xai4aZBdeKSddPYWVGSOTG6mDje7umzI5JJIrW7zNS59ZBOhCt1q9xx8qCeMws8gMZCNx35vXQXYDjGoV2TXpLUj2jKQbcMwEcjPeIosSKsmljqRjZBKCttxye3SccVRaOzOa2ZCFcwZDZD';

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
  const timeStamp = new Date().getTime();

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

  return {
    outputContexts: [
      {
        name: `${session}/contexts/user`, // Necessary because https://dialogflow.com/docs/reference/v1-v2-migration-guide-fulfillment#contexts_and_sessions
        lifespanCount: 999,
        parameters: { name },
      },
    ],
  };
}

async function updateState(stateName) {
  return async (request) => {
    const psid = getPSID(request);
    console.log(`Setting ${psid} to ${stateName}`);

    await db.update({
      TableName: 'Conversations',
      Key: { psid },
      UpdateExpression: 'set state = :s',
      ExpressionAttributeValues: {
        ':s': stateName,
      },
    });

    console.log('Done.');
  };
}

async function addFeedback(psid, type, payload) {
  console.log(
    `Adding feedback with type ${type} and payload ${payload} for ${psid}`,
  );
  await db
    .put({
      TableName: 'Conversations',
      Item: {
        psid,
        type,
        payload,
        createdAt: new Date().getTime(),
      },
    })
    .promise();

  console.log('Done');
}

async function foodRatingHandler(request) {
  console.log('Executing foodRatingHandler');
  let foodRating;
  const psid = getPSID(request);

  const p = request.parameters;

  if (p.thumbsdown) {
    foodRating = '0';
  } else if (p.thumbsUp) {
    foodRating = '1';
  } else if (p.oneHundred) {
    foodRating = '2';
  } else {
    console.log('Could not get feedback. Params were: ', JSON.stringify(p));
    throw new Error('Unable to collect correct feedback');
  }

  await updateState('GET_VEGAN_FEEDBACK')(request);
  await addFeedback(psid, 'FOOD_REACTION', foodRating);
}

async function veganRatingHandler(request) {
  let veganRating;

  console.log('Vegan rating function here');
  const p = request.parameters;
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
}

async function moreFoodHandler(request) {
  let foodNotification;
  const psid = getPSID(request);
  console.log('PSID is ', psid);

  const p = request.parameters;

  if (p.morefood) {
    foodNotification = 'Yes';
    console.log('Yay they want more!');
  } else if (p.nomorefood) {
    foodNotification = 'No';
    console.log('Sad, they dont want food');
  } else {
    console.error('More food function has an error');
    throw new Error(
      'Cannot collect response from params + ',
      JSON.stringify(p),
    );
  }

  await updateState('DONE')(request);
  await addFeedback(psid, 'INTERESTED_IN_FOOD', foodNotification);
}

const intentMap = {
  '1.getStarted': createConversation,
  '1a.getStarted.response.yes': updateState('GET_FOOD_FEEDBACK'),
  '1b.getStarted.response.no': updateState('GET_FOOD_FEEDBACK'),
  '2b.thumbsdown': foodRatingHandler,
  '2a.thumbsupand100': foodRatingHandler,
  '3a.more.options': veganRatingHandler,
  '4a.goodend': moreFoodHandler,
  '4b.Badend': moreFoodHandler,
};

const extractIntent = body => body.queryResult.intent.displayName;

const handleRequest = async (request) => {
  try {
    const body = JSON.parse(request.body);
    const intent = extractIntent(body);

    console.log(`Handling intent ${intent} with ${JSON.stringify(body)}`);

    const response = await intentMap[intent](body);
    console.log('Responding with: %j', response);
    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: e.message,
    };
  }
};

export const handler = event => handleRequest(event);
