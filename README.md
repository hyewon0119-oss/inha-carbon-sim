# Digital Twin-Based Carbon Forecasting System 🌍⚡

![Architecture Badge](https://img.shields.io/badge/Architecture-3_Tier-blue)
![ML Badge](https://img.shields.io/badge/Machine_Learning-LSTM_%7C_XGBoost-orange)
![IoT Badge](https://img.shields.io/badge/IoT-ESP32_%7C_MQTT-green)

## 📌 Overview
Educational institutions often operate energy systems without real-time carbon emission tracking, leading to unused solar generation and heavy reliance on coal-based grid power during peak hours. 

This project is a **Digital Twin-based carbon forecasting system** that creates a virtual replica of campus energy systems. It shifts energy management from being strictly cost-centric to **emission-centric**, utilizing machine learning to predict demand and optimize load scheduling.

## 🚀 Key Features & Innovations
* **Carbon-First Optimization:** Minimizes both carbon emissions and electricity costs using a multi-objective optimization framework (via CVXPY).
* **Probabilistic Forecasting:** Utilizes Quantile Regression to predict confidence intervals (5th, 50th, 95th percentiles) rather than just point estimates, enabling risk-aware decision-making.
* **Real-Time Digital Twin:** Synchronizes a virtual model with physical IoT sensors to test "what-if" scenarios and detect anomalies.

## 🏗️ System Architecture
The system follows a three-layer architecture:
1. **Physical Infrastructure (IoT Sensing):** ESP32 microcontrollers, ACS712 current sensors, and relay modules communicating via MQTT.
2. **Digital Twin & AI Engine (Cloud):** Python/FastAPI backend backed by PostgreSQL. Powers three core ML models:
   * **LSTM:** 24-hour ahead load demand forecasting (<8% MAPE).
   * **XGBoost:** Grid carbon intensity prediction (gCO₂/kWh).
   * **GradientBoostingRegressor:** Uncertainty quantification.
3. **Visualization Layer:** React.js dashboard featuring real-time charts via Recharts.

## 📊 Impact & Results (Simulated)
Compared to a standard baseline grid setup, this system achieves:
* **63% reduction** in daily carbon emissions (from 24.5 kg to 9.1 kg CO₂).
* **28% savings** in monthly electricity costs.
* **87% utilization** of renewable energy (up from 62% in non-AI hybrid setups).
* **40% reduction** in grid dependency during peak hours.
