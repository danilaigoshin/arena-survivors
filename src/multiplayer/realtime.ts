import { parseNetworkInput } from './protocol';
import { NETWORK_VERSION, type NetworkInput } from './types';

const INPUT_MAGIC = 0x4941; // "AI" in little endian
const INPUT_HEADER_BYTES = 4;
const INPUT_BYTES = 18;
export const INPUT_REDUNDANCY = 3;

function inputAxis(value: number): number {
  return Math.max(-127, Math.min(127, Math.round(value * 127)));
}

export function encodeInputPacket(inputs: readonly NetworkInput[]): ArrayBuffer {
  const count = Math.min(INPUT_REDUNDANCY, inputs.length);
  if (count === 0) throw new Error('input packet is empty');
  const start = inputs.length - count;
  const buffer = new ArrayBuffer(INPUT_HEADER_BYTES + count * INPUT_BYTES);
  const view = new DataView(buffer);
  view.setUint16(0, INPUT_MAGIC, true);
  view.setUint8(2, NETWORK_VERSION);
  view.setUint8(3, count);
  let offset = INPUT_HEADER_BYTES;
  for (let index = start; index < inputs.length; index++) {
    const input = inputs[index];
    view.setUint32(offset, input.seq, true);
    view.setUint32(offset + 4, input.clientTick, true);
    view.setUint32(offset + 8, input.snapshotSeq, true);
    view.setInt8(offset + 12, inputAxis(input.moveX));
    view.setInt8(offset + 13, inputAxis(input.moveY));
    view.setUint32(offset + 14, input.abilityPressSeq, true);
    offset += INPUT_BYTES;
  }
  return buffer;
}

export function decodeInputPacket(data: ArrayBuffer): NetworkInput[] {
  if (data.byteLength < INPUT_HEADER_BYTES) throw new Error('truncated input packet');
  const view = new DataView(data);
  if (view.getUint16(0, true) !== INPUT_MAGIC) throw new Error('invalid input magic');
  if (view.getUint8(2) !== NETWORK_VERSION) throw new Error('incompatible input version');
  const count = view.getUint8(3);
  if (count < 1 || count > INPUT_REDUNDANCY) throw new Error('invalid input count');
  if (data.byteLength !== INPUT_HEADER_BYTES + count * INPUT_BYTES) {
    throw new Error('unexpected input bytes');
  }
  const inputs: NetworkInput[] = [];
  let offset = INPUT_HEADER_BYTES;
  for (let index = 0; index < count; index++) {
    const parsed = parseNetworkInput({
      seq: view.getUint32(offset, true),
      clientTick: view.getUint32(offset + 4, true),
      snapshotSeq: view.getUint32(offset + 8, true),
      moveX: view.getInt8(offset + 12) / 127,
      moveY: view.getInt8(offset + 13) / 127,
      abilityPressSeq: view.getUint32(offset + 14, true),
    });
    if (!parsed) throw new Error('invalid input payload');
    inputs.push(parsed);
    offset += INPUT_BYTES;
  }
  return inputs;
}
