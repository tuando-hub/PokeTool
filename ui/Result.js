const State = require("../core/State");

function render(root) {
  root.add({
    type: "list",
    props: {
      data: buildData()
    },
    layout: $layout.fill
  });
}

function buildData() {
  const list = State.get().results;

  if (!list.length) {
    return ["No result"];
  }

  return list.map(x => {
    return `${x.email} - ${x.status || ""}`;
  });
}

module.exports = {
  render
};