type Env = {
  PROBE_TOKEN: string;
};

export default {
  fetch(request: Request, env: Env) {
    if (request.headers.get("authorization") !== `Bearer ${env.PROBE_TOKEN}`) {
      return new Response(null, { status: 404 });
    }

    let state = 1;
    for (let index = 0; index < 20_000_000; index++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    }
    return Response.json({ paidRuntime: true, state });
  }
};
