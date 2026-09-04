import Vapi from "@vapi-ai/web";

window.PensionVoice = {
  create({ publicKey, assistantId, onEvent }) {
    const client = new Vapi(publicKey);
    const relay = type => payload => onEvent?.(type, payload);
    client.on("call-start", relay("call-start"));
    client.on("call-end", relay("call-end"));
    client.on("speech-start", relay("speech-start"));
    client.on("speech-end", relay("speech-end"));
    client.on("message", relay("message"));
    client.on("error", relay("error"));
    client.on("volume-level", relay("volume-level"));
    return {
      start: () => client.start(assistantId),
      stop: () => client.stop(),
      setMuted: muted => client.setMuted(muted),
      isMuted: () => client.isMuted(),
    };
  },
};
