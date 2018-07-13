import { handler } from '../chatbot';

const request = {
  responseId: '8a20b78c-c288-4b34-9dd3-7e2f9a9e8711',
  queryResult: {
    queryText: 'Get started',
    action: 'get.name',
    parameters: {
      started: 'Get started',
    },
    allRequiredParamsPresent: true,
    fulfillmentMessages: [
      {
        quickReplies: {
          title: 'Hey #user.name! Would you like to see more sustainable food options on campus?',
          quickReplies: ['Yes', 'No'],
        },
        platform: 'FACEBOOK',
      },
      {
        text: {
          text: [''],
        },
      },
    ],
    outputContexts: [
      {
        name:
          'projects/singer-test-3f142/agent/sessions/f0ee6431-561b-49c5-8a2e-4f27ae401c2a/contexts/getstarted-followup',
        lifespanCount: 4,
        parameters: {
          'started.original': 'Get started',
          started: 'Get started',
        },
      },
    ],
    intent: {
      name: 'projects/singer-test-3f142/agent/intents/e50b776b-71d4-46fd-8626-ae7663e8d916',
      displayName: '1.getStarted',
    },
    intentDetectionConfidence: 1,
    languageCode: 'en',
  },
  originalDetectIntentRequest: {
    payload: {},
  },
  session: 'projects/singer-test-3f142/agent/sessions/f0ee6431-561b-49c5-8a2e-4f27ae401c2a',
};

const expectedResponse = {
  outputContexts: [
    {
      name:
        'projects/singer-test-3f142/agent/sessions/f0ee6431-561b-49c5-8a2e-4f27ae401c2a/contexts/user',
      lifespanCount: 999,
      parameters: { name: 'Nelson' },
    },
  ],
};

test('hello', async () => {
  const response = await handler({ body: JSON.stringify(request) });
  expect(response.statusCode).toEqual(200);
  const body = JSON.parse(response.body);
  expect(body).toEqual(expectedResponse);
});
