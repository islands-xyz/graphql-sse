/* eslint-disable @typescript-eslint/no-explicit-any */

import { jest } from '@jest/globals';
import EventSource from 'eventsource';
import { startTServer, startDisposableServer } from './utils/tserver';
import { eventStream } from './utils/eventStream';
import { createClient, createHandler } from '../index';
import { TOKEN_HEADER_KEY, TOKEN_QUERY_KEY } from '../common';
import http from 'http';
import { schema } from './fixtures/simple';
import fetch from 'node-fetch';
import express from 'express';
import Fastify from 'fastify';

// just does nothing
function noop(): void {
  /**/
}

it('should only accept valid accept headers', async () => {
  const { request } = await startTServer();

  const { data: token } = await request('PUT');

  let res = await request('GET', {
    accept: 'gibberish',
    [TOKEN_HEADER_KEY]: token,
  });
  expect(res.statusCode).toBe(406);

  res = await request('GET', {
    accept: 'application/graphql+json',
    [TOKEN_HEADER_KEY]: token,
  });
  expect(res.statusCode).toBe(400);
  expect(res.statusMessage).toBe('Missing query');

  res = await request('GET', {
    accept: 'application/json',
    [TOKEN_HEADER_KEY]: token,
  });
  expect(res.statusCode).toBe(400);
  expect(res.statusMessage).toBe('Missing query');

  res = await request('GET', { accept: 'text/event-stream' });
  expect(res.statusCode).toBe(400);
  expect(res.statusMessage).toBe('Missing query');

  res = await request('POST', { accept: 'text/event-stream' }, { query: '' });
  expect(res.statusCode).toBe(400);
  expect(res.statusMessage).toBe('Missing query');
});

it.todo('should throw all unexpected errors from the handler');

it.todo('should use the string body argument from the handler');

it.todo('should use the object body argument from the handler');

describe('single connection mode', () => {
  it('should respond with 404s when token was not previously registered', async () => {
    const { request } = await startTServer();

    // maybe POST gql request
    let res = await request('POST');
    expect(res.statusCode).toBe(404);
    expect(res.statusMessage).toBe('Stream not found');

    // maybe GET gql request
    res = await request('GET');
    expect(res.statusCode).toBe(404);
    expect(res.statusMessage).toBe('Stream not found');

    // completing/ending an operation
    res = await request('DELETE');
    expect(res.statusCode).toBe(404);
    expect(res.statusMessage).toBe('Stream not found');
  });

  it('should get a token with PUT request', async () => {
    const { request } = await startTServer({ authenticate: () => 'token' });

    const { statusCode, headers, data } = await request('PUT');

    expect(statusCode).toBe(201);
    expect(headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(data).toBe('token');
  });

  it('should allow event streams on reservations only', async () => {
    const { url, request } = await startTServer();

    // no reservation no connect
    let es = new EventSource(url);
    await new Promise<void>((resolve) => {
      es.onerror = () => {
        resolve();
        es.close(); // no retry
      };
    });

    // token can be sent through the header
    let res = await request('PUT');
    es = new EventSource(url, {
      headers: { [TOKEN_HEADER_KEY]: res.data },
    });
    await new Promise<void>((resolve, reject) => {
      es.onopen = () => resolve();
      es.onerror = (e) => {
        reject(e);
        es.close(); // no retry
      };
    });
    es.close();

    // token can be sent through the url
    res = await request('PUT');
    es = new EventSource(url + '?' + TOKEN_QUERY_KEY + '=' + res.data);
    await new Promise<void>((resolve, reject) => {
      es.onopen = () => resolve();
      es.onerror = (e) => {
        reject(e);
        es.close(); // no retry
      };
    });
    es.close();
  });

  it('should not allow operations without providing an operation id', async () => {
    const { request } = await startTServer();

    const { data: token } = await request('PUT');

    const { statusCode, statusMessage } = await request(
      'POST',
      { [TOKEN_HEADER_KEY]: token },
      { query: '{ getValue }' },
    );

    expect(statusCode).toBe(400);
    expect(statusMessage).toBe('Operation ID is missing');
  });

  it('should stream query operations to connected event stream', async (done) => {
    const { url, request } = await startTServer();

    const { data: token } = await request('PUT');

    const es = new EventSource(url + '?' + TOKEN_QUERY_KEY + '=' + token);
    es.addEventListener('next', (event) => {
      expect((event as any).data).toMatchSnapshot();
    });
    es.addEventListener('complete', () => {
      es.close();
      done();
    });

    const { statusCode } = await request(
      'POST',
      { [TOKEN_HEADER_KEY]: token },
      { query: '{ getValue }', extensions: { operationId: '1' } },
    );
    expect(statusCode).toBe(202);
  });

  it.todo('should stream query operations even if event stream connects later');

  it('should stream subscription operations to connected event stream', async (done) => {
    const { url, request } = await startTServer();

    const { data: token } = await request('PUT');

    const es = new EventSource(url + '?' + TOKEN_QUERY_KEY + '=' + token);
    es.addEventListener('next', (event) => {
      // called 5 times
      expect((event as any).data).toMatchSnapshot();
    });
    es.addEventListener('complete', () => {
      es.close();
      done();
    });

    const { statusCode } = await request(
      'POST',
      { [TOKEN_HEADER_KEY]: token },
      { query: 'subscription { greetings }', extensions: { operationId: '1' } },
    );
    expect(statusCode).toBe(202);
  });

  it('should report operation validation issues to request', async () => {
    const { url, request } = await startTServer();

    const { data: token } = await request('PUT');

    const es = new EventSource(url + '?' + TOKEN_QUERY_KEY + '=' + token);
    es.addEventListener('next', () => {
      fail('Shouldnt have omitted');
    });
    es.addEventListener('complete', () => {
      fail('Shouldnt have omitted');
    });

    const { statusCode, data } = await request(
      'POST',
      { [TOKEN_HEADER_KEY]: token },
      { query: '{ notExists }', extensions: { operationId: '1' } },
    );
    expect(statusCode).toBe(400);
    expect(data).toMatchSnapshot();

    es.close();
  });

  it('should bubble errors thrown in onNext to the handler', async (done) => {
    const onNextErr = new Error('Woops!');

    const handler = createHandler({
      schema,
      onNext: () => {
        throw onNextErr;
      },
    });

    const [, url, dispose] = await startDisposableServer(
      http.createServer(async (req, res) => {
        try {
          await handler(req, res);
        } catch (err) {
          expect(err).toBe(onNextErr);

          await dispose();
          done();
        }
      }),
    );

    const client = createClient({
      singleConnection: true,
      url,
      fetchFn: fetch,
      retryAttempts: 0,
    });

    client.subscribe(
      {
        query: '{ getValue }',
      },
      {
        next: noop,
        error: noop,
        complete: noop,
      },
    );
  });
});

describe('distinct connections mode', () => {
  it('should stream query operations to connected event stream and then disconnect', async () => {
    const { url, waitForDisconnect } = await startTServer();

    const control = new AbortController();

    // POST

    let msgs = await eventStream({
      signal: control.signal,
      url,
      body: { query: '{ getValue }' },
    });

    for await (const msg of msgs) {
      expect(msg).toMatchSnapshot();
    }

    await waitForDisconnect();

    // GET

    const urlQuery = new URL(url);
    urlQuery.searchParams.set('query', '{ getValue }');

    msgs = await eventStream({
      signal: control.signal,
      url: urlQuery.toString(),
    });

    for await (const msg of msgs) {
      expect(msg).toMatchSnapshot();
    }

    await waitForDisconnect();
  });

  it('should stream subscription operations to connected event stream and then disconnect', async () => {
    const { url, waitForDisconnect } = await startTServer();

    const control = new AbortController();

    // POST

    let msgs = await eventStream({
      signal: control.signal,
      url,
      body: { query: 'subscription { greetings }' },
    });

    for await (const msg of msgs) {
      expect(msg).toMatchSnapshot();
    }

    await waitForDisconnect();

    // GET

    const urlQuery = new URL(url);
    urlQuery.searchParams.set('query', 'subscription { greetings }');

    msgs = await eventStream({
      signal: control.signal,
      url: urlQuery.toString(),
    });

    for await (const msg of msgs) {
      expect(msg).toMatchSnapshot();
    }

    await waitForDisconnect();
  });

  it('should report operation validation issues by streaming them', async () => {
    const { url, waitForDisconnect } = await startTServer();

    const control = new AbortController();

    const msgs = await eventStream({
      signal: control.signal,
      url,
      body: { query: '{ notExists }' },
    });

    for await (const msg of msgs) {
      expect(msg).toMatchSnapshot();
    }

    await waitForDisconnect();
  });

  it('should complete subscription operations after client disconnects', async () => {
    const { url, waitForOperation, waitForComplete } = await startTServer();

    const control = new AbortController();

    await eventStream({
      signal: control.signal,
      url,
      body: { query: 'subscription { ping }' },
    });

    await waitForOperation();

    control.abort();

    await waitForComplete();
  });

  it('should bubble errors thrown in onNext to the handler', async (done) => {
    const onNextErr = new Error('Woops!');

    const handler = createHandler({
      schema,
      onNext: () => {
        throw onNextErr;
      },
    });

    const [, url, dispose] = await startDisposableServer(
      http.createServer(async (req, res) => {
        try {
          await handler(req, res);
        } catch (err) {
          expect(err).toBe(onNextErr);

          await dispose();
          done();
        }
      }),
    );

    const client = createClient({
      url,
      fetchFn: fetch,
      retryAttempts: 0,
    });

    client.subscribe(
      {
        query: '{ getValue }',
      },
      {
        next: noop,
        error: noop,
        complete: noop,
      },
    );
  });
});

describe('express', () => {
  it('should work as advertised in the readme', async () => {
    const app = express();
    const handler = createHandler({ schema });
    app.use('/graphql/stream', handler);
    const [, url, dispose] = await startDisposableServer(
      http.createServer(app),
    );

    const client = createClient({
      url: url + '/graphql/stream',
      fetchFn: fetch,
      retryAttempts: 0,
    });

    const next = jest.fn();
    await new Promise<void>((resolve, reject) => {
      client.subscribe(
        {
          query: 'subscription { greetings }',
        },
        {
          next: next,
          error: reject,
          complete: resolve,
        },
      );
    });

    expect(next).toBeCalledTimes(5);
    expect(next.mock.calls).toMatchSnapshot();

    await dispose();
  });
});

describe('fastify', () => {
  it('should work as advertised in the readme', async () => {
    const handler = createHandler({ schema });
    const fastify = Fastify();
    fastify.all('/graphql/stream', (req, res) =>
      handler(req.raw, res.raw, req.body),
    );
    const url = await fastify.listen({ port: 0 });

    const client = createClient({
      url: url + '/graphql/stream',
      fetchFn: fetch,
      retryAttempts: 0,
    });

    const next = jest.fn();
    await new Promise<void>((resolve, reject) => {
      client.subscribe(
        {
          query: 'subscription { greetings }',
        },
        {
          next: next,
          error: reject,
          complete: resolve,
        },
      );
    });

    expect(next).toBeCalledTimes(5);
    expect(next.mock.calls).toMatchSnapshot();

    await fastify.close();
  });
});
