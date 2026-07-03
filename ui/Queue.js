const State = require("../core/State");

function render(root) {
  root.add({
    type: "list",
    props: {
      id: "queueList",
      data: buildData()
    },
    layout: $layout.fill
  });
}

function buildData() {
  const q = State.get().queue;

  if (!q.length) {
    return ["Queue empty"];
  }

  return q.map((x, i) => {
    return `${i + 1}. ${x.email} - ${x.status}`;
  });
}

module.exports = {
  render
};