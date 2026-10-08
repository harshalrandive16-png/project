const express = require('express');
const cors = require('cors');
const serverless = require('serverless-http');
const apiRouter = require('../../services/apiRouter');

const app = express();
app.use(cors());
app.use(express.json());

// Netlify redirect ke baad path dono tarah ka aa sakta hai
app.use('/api', apiRouter);
app.use('/.netlify/functions/api', apiRouter);

module.exports.handler = serverless(app);