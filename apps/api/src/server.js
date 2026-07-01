const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const config = require('./config');
const { errorHandler } = require('./middleware/error-handler');

const listeningRouter = require('./modules/listening');
const contentEngineRouter = require('./modules/content-engine');
const editorialRouter = require('./modules/editorial');
const distributionRouter = require('./modules/distribution');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/listening', listeningRouter);
app.use('/api/content', contentEngineRouter);
app.use('/api/editorial', editorialRouter);
app.use('/api/distribution', distributionRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`CREA Command Center API listening on port ${config.port}`);
});
