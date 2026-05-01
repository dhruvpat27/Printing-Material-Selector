const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Schema
const submissionSchema = new mongoose.Schema({
  projectDescription: { type: String, required: true },
  costPriority: { type: Number, min: 1, max: 5, required: true },
  strengthPriority: { type: Number, min: 1, max: 5, required: true },
  adverseEnvironmentPriority: { type: Number, min: 1, max: 5, required: true },
  recommendedMaterial: { type: String, enum: ['PLA', 'PETG', 'ABS'], required: true },
  scores: {
    PLA: Number,
    PETG: Number,
    ABS: Number,
  },
  createdAt: { type: Date, default: Date.now },
});

const Submission = mongoose.model('Submission', submissionSchema);

// Material recommendation logic
// Weights: strength > cost > adverse environment
// ABS => strength, PLA => cheap, PETG => adverse environments
function recommendMaterial(cost, strength, adverse) {
  const STRENGTH_WEIGHT = 3;
  const COST_WEIGHT = 2;
  const ADVERSE_WEIGHT = 1;

  const absScore = strength * STRENGTH_WEIGHT;
  const plaScore = cost * COST_WEIGHT;
  const petgScore = adverse * ADVERSE_WEIGHT;

  const scores = { ABS: absScore, PLA: plaScore, PETG: petgScore };
  const recommended = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];

  return { recommended, scores };
}

// POST /api/recommend
app.post('/api/recommend', async (req, res) => {
  try {
    const { projectDescription, costPriority, strengthPriority, adverseEnvironmentPriority } = req.body;

    if (!projectDescription || costPriority == null || strengthPriority == null || adverseEnvironmentPriority == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { recommended, scores } = recommendMaterial(
      Number(costPriority),
      Number(strengthPriority),
      Number(adverseEnvironmentPriority)
    );

    // Save to MongoDB if connected
    if (mongoose.connection.readyState === 1) {
      const submission = new Submission({
        projectDescription,
        costPriority: Number(costPriority),
        strengthPriority: Number(strengthPriority),
        adverseEnvironmentPriority: Number(adverseEnvironmentPriority),
        recommendedMaterial: recommended,
        scores,
      });
      await submission.save();
    }

    res.json({ recommended, scores });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/submissions (for review/training data)
app.get('/api/submissions', async (req, res) => {
  try {
    const submissions = await Submission.find().sort({ createdAt: -1 }).limit(100);
    res.json(submissions);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || '';

async function start() {
  if (MONGO_URI) {
    try {
      await mongoose.connect(MONGO_URI);
      console.log('Connected to MongoDB');
    } catch (err) {
      console.warn('MongoDB connection failed — running without DB:', err.message);
    }
  } else {
    console.warn('No MONGO_URI set — running without database persistence');
  }

  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

start();
