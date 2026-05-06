# FitCare AI Form Correction Ecosystem

FitCare is a full-stack health and fitness application designed to provide real-time AI-powered form correction and workout analysis. The ecosystem comprises a FastAPI backend for AI inference and a React Native (Expo) mobile application for user interaction and pose detection.

## Key Features

- **AI Workout Analysis**: Uses Ollama (Phi-3) for intelligent workout feedback and diet coaching.
- **Real-Time Pose Detection**: Integrates TensorFlow.js with React Native to track user movements during exercises.
- **Authentication**: Secure login system for personalized user experiences.
- **Dynamic Navigation**: Custom side drawer navigation with a premium user interface.
- **Health Integration**: Capable of bridging with wearable data and Health Connect.
- **Comprehensive Tracking**: Modules for diet, meals, weight, and general fitness goals.

## Technology Stack

### Backend
- **Framework**: FastAPI (Python)
- **Database**: SQLite (SQLAlchemy ORM)
- **AI Inference Engine**: Ollama (Phi-3)
- **Client Communication**: HTTP/REST API

### Mobile
- **Core**: React Native via Expo
- **Pose Estimation**: TensorFlow.js-models/pose-detection
- **UI/UX**: React Navigation (Drawer/Stack), Reanimated
- **Additional**: Expo Camera, Health Connect Integration

## Project Structure

- **backend/**: Python FastAPI server and database logic.
- **mobile/**: React Native Expo source code for the mobile app.
- **scripts/**: Batch files (`start_all.bat`, `start_local.bat`) for easy local deployment.
- **web/**: Legacy/Standalone HTML assets for web representation.

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js & npm
- Ollama (installed and running with `phi3` model)

### Installation

#### 1. General Prerequisites
- **Python 3.10+**: Required for the FastAPI backend.
- **Node.js (LTS)**: Required for the Expo/React Native mobile app.
- **Ollama**: Download and install from [ollama.com](https://ollama.com). Once installed, run `ollama pull phi3` to download the required model.

#### 2. Repository Setup
Clone the repository to your local machine:
```bash
git clone <repository-url>
cd FitCareApp
```

#### 3. Backend Setup (FastAPI)
Navigate to the `backend` directory and set up a virtual environment:
```bash
cd backend
python -m venv venv
# Enable the virtual environment:
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate
```

Install the required Python packages:
```bash
pip install -r requirements.txt
```

**Environment Variables**:
Create a `.env` file in the `backend` directory based on `.env.example`:
```bash
cp .env.example .env
```
Configure your `.env` file with the following optional parameters:
- `OLLAMA_BASE_URL`: Defaults to `http://localhost:11434`.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`: (Optional) Required for real SMS OTP verification. If left blank, the system will print OTPs to the terminal for development.

The database (`fitcare.db`) will be automatically initialized via SQLAlchemy when you first start the server.

#### 4. Mobile Setup (Expo)
Navigate to the `mobile` directory and install the JavaScript dependencies:
```bash
cd ../mobile
npm install
```

**TensorFlow.js Compatibility**:
The project includes a global monkey-patch in `App.js` for TensorFlow.js compatibility with modern Expo camera versions. No manual configuration is required for this.

**Health Connect & BLE**:
The mobile app is configured with plugins for `react-native-health-connect` and `react-native-ble-plx` in `app.json`. For full functionality, testing on a physical Android device with the Expo Go app or a development build is recommended.

### Running the Application

For a quick start on Windows, you can use the provided batch script in the root directory:
```bash
start_all.bat
```

Alternatively, start the components manually:

**Start Ollama Inference Engine**:
```bash
ollama run phi3
```

**Start the Backend Server**:
```bash
cd backend
python -m uvicorn main:app --reload
```

**Start the Mobile Application**:
```bash
cd mobile
npx expo start
```

## API Documentation

The backend provides a Swagger UI for API exploration at `http://localhost:8000/docs` when the server is running. Key endpoints include:
- `POST /api/workout/analysis`: Processes workout data for AI feedback.

## License

This project is private and intended for educational/research purposes.

## Group 11

- Aditya Gavane
- Priyam Gandhi
- Manashri Ghan
- Mayuresh Gavali
- Gaurav Jain

