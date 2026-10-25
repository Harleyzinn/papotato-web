window.capturePicker.list().then((sources) => {
  for (const source of sources) {
    const button = document.createElement('button');
    const image = document.createElement('img');
    image.src = source.thumbnail;
    image.alt = '';
    button.append(image, document.createTextNode(source.name));
    button.onclick = () =>
      window.capturePicker.select({
        id: source.id,
        audio: document.getElementById('audio').checked,
      });
    document.getElementById('sources').append(button);
  }
});
document.getElementById('cancel').onclick = () => window.capturePicker.select({});
