import { WaitingProposal, createProposalQueue } from "../../lib/proposalBuffer";

function waiting(
  hp: number
): WaitingProposal<{ type: "setHP"; payload: number }> {
  return { proposal: [{ type: "setHP", payload: hp }], origin: {}, depth: 0 };
}

describe("the queue of the waiting proposals", function () {
  it("should hand them over in the order they arrived", function () {
    const queue = createProposalQueue<{ type: "setHP"; payload: number }>();

    queue.push(waiting(1));
    queue.push(waiting(2));
    const first = queue.shift();
    queue.push(waiting(3));

    expect(first?.proposal[0].payload).toBe(1);
    expect(queue.shift()?.proposal[0].payload).toBe(2);
    expect(queue.shift()?.proposal[0].payload).toBe(3);
    expect(queue.shift()).toBeUndefined();
  });

  it("should have nothing to hand over once it is empty", function () {
    const queue = createProposalQueue<{ type: "setHP"; payload: number }>();
    queue.push(waiting(1));
    queue.shift();

    expect(queue.shift()).toBeUndefined();
  });

  it("should start again once it was emptied", function () {
    const queue = createProposalQueue<{ type: "setHP"; payload: number }>();
    queue.push(waiting(1));
    queue.shift();
    queue.shift();

    queue.push(waiting(2));
    queue.push(waiting(3));

    expect(queue.shift()?.proposal[0].payload).toBe(2);
    expect(queue.shift()?.proposal[0].payload).toBe(3);
    expect(queue.shift()).toBeUndefined();
  });

  it("should take a proposal at the same cost, however many wait", function () {
    const queue = createProposalQueue<{ type: "setHP"; payload: number }>();
    for (let hp = 0; hp < 100000; hp++) {
      queue.push(waiting(hp));
    }

    // What it takes of the processor, not of the clock: the machine may be
    // busy with something else.
    const start = process.cpuUsage();
    let taken = 0;
    while (queue.shift() !== undefined) {
      taken++;
    }
    const { user, system } = process.cpuUsage(start);

    expect(taken).toBe(100000);
    // Moving the whole list at each one took seconds.
    expect((user + system) / 1000).toBeLessThan(500);
  }, 120000);
});
