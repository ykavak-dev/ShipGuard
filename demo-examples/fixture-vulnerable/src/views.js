// XSS: innerHTML with user input
function renderComment(container, comment) {
  container.innerHTML = comment.body;
}

// XSS: document.write with untrusted data
function renderPage(title) {
  document.write('<h1>' + title + '</h1>');
}

// Error Info Leak: sending error stack to client
function errorHandler(err, req, res) {
  res.status(500).send(err.stack);
}

module.exports = { renderComment, renderPage, errorHandler };
