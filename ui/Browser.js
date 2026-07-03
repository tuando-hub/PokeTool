function render(root) {
  root.add({
    type: "web",
    props: {
      id: "mainWeb",
      url: "about:blank"
    },
    layout: $layout.fill
  });
}

module.exports = {
  render
};