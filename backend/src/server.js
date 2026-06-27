const express = require('express');
const cors = require('cors');
const { processHierarchy } = require('./processHierarchy');

const app = express();

app.use(cors());
app.use(express.json());

const IDENTITY = {
  user_id: 'tarunsaini_08092005',
  email_id: 'tarun0905.be23@chitkara.edu.in',
  college_roll_number: '2310990905',
};

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'BFHL API is running. POST to /bfhl.' });
});

app.post('/bfhl', (req, res) => {
  try {
    const { data } = req.body || {};

    const rawEntries = Array.isArray(data) ? data : [];

    const { hierarchies, invalidEntries, duplicateEdges, summary } =
      processHierarchy(rawEntries);

    return res.status(200).json({
      ...IDENTITY,
      hierarchies,
      invalid_entries: invalidEntries,
      duplicate_edges: duplicateEdges,
      summary,
    });
  } catch (err) {
    console.error('Error processing /bfhl request:', err);
    return res.status(500).json({
      ...IDENTITY,
      error: 'Internal processing error. Please check your input format.',
    });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found.` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BFHL API listening on port ${PORT}`);
});

module.exports = app;
