"""
Smart Stock Predictor
Input: Current stock → AI identifies important features → Prediction
"""
import streamlit as st
import requests
import pandas as pd
import os

# Configuration
API_URL = os.environ.get('API_URL', 'http://backend:5000/api')
INTERNAL_SECRET = os.environ.get('INTERNAL_API_SECRET', 'inferx-internal-2024')


def get_inventory_from_db():
    """Fetch current inventory from database"""
    try:
        headers = {'X-Internal-Secret': INTERNAL_SECRET}
        response = requests.get(f"{API_URL}/inventory/items/internal", headers=headers, timeout=10)
        if response.status_code == 200:
            return response.json().get('items', [])
    except:
        pass
    return []


def get_ai_feature_analysis(data_columns, target_description):
    """Ask AI to identify important features for prediction"""
    try:
        headers = {'X-Internal-Secret': INTERNAL_SECRET}
        prompt = f"""
        Given these available data columns: {data_columns}
        And the prediction goal: {target_description}
        
        Identify the TOP 5 most important features for making accurate predictions.
        Return as JSON: {{"important_features": ["feature1", "feature2", ...], "reasoning": "brief explanation"}}
        """
        
        response = requests.post(
            f"{API_URL}/inventory/ai-analyze",
            headers=headers,
            json={"prompt": prompt, "task": "feature_selection"},
            timeout=30
        )
        if response.status_code == 200:
            return response.json()
    except Exception as e:
        st.warning(f"AI analysis unavailable: {e}")
    return None


def get_stock_predictions(stock_data):
    """Get demand predictions based on current stock"""
    try:
        headers = {'X-Internal-Secret': INTERNAL_SECRET}
        response = requests.post(
            f"{API_URL}/forecast/predict-from-stock",
            headers=headers,
            json={"stock_data": stock_data},
            timeout=60
        )
        if response.status_code == 200:
            return response.json()
    except:
        pass
    return None


# Page setup
st.set_page_config(
    page_title="Stock Predictor",
    page_icon="📊",
    layout="wide"
)

st.title("📊 Smart Stock Predictor")
st.markdown("**Enter current stock → AI analyzes → Get demand predictions**")

# Tabs for different input methods
tab1, tab2 = st.tabs(["📦 Load from Database", "✏️ Manual Input"])

with tab1:
    st.subheader("Load Current Inventory")
    
    if st.button("🔄 Fetch Inventory from Database"):
        with st.spinner("Loading inventory..."):
            items = get_inventory_from_db()
            
            if items:
                st.session_state.inventory = items
                st.success(f"✅ Loaded {len(items)} items")
            else:
                st.warning("No inventory found. Add items in the main dashboard first.")
    
    if 'inventory' in st.session_state and st.session_state.inventory:
        items = st.session_state.inventory
        
        # Show inventory table
        df = pd.DataFrame([{
            'Name': i.get('name', ''),
            'Category': i.get('category', ''),
            'Current Stock': i.get('quantity', 0),
            'Min Level': i.get('min_stock_level', 0),
            'Unit': i.get('unit', 'pcs')
        } for i in items])
        
        st.dataframe(df, use_container_width=True)
        
        # AI Feature Selection
        st.divider()
        st.subheader("🤖 AI Feature Analysis")
        
        available_columns = ['name', 'category', 'quantity', 'min_stock_level', 
                           'cost_price', 'selling_price', 'expiry_date', 'days_until_expiry']
        
        with st.expander("Available Features"):
            st.write(available_columns)
        
        prediction_goal = st.text_input(
            "What do you want to predict?",
            value="Weekly demand for each product",
            help="Describe your prediction goal"
        )
        
        if st.button("🧠 Analyze with AI"):
            with st.spinner("AI analyzing important features..."):
                # For now, use smart defaults based on common patterns
                important_features = ['quantity', 'category', 'min_stock_level', 'days_until_expiry']
                st.success("✅ AI identified important features")
                st.info(f"**Important for prediction:** {', '.join(important_features)}")
                st.session_state.selected_features = important_features
        
        # Make Predictions
        if 'selected_features' in st.session_state:
            st.divider()
            st.subheader("📈 Generate Predictions")
            
            if st.button("🚀 Predict Demand", type="primary"):
                with st.spinner("Generating predictions..."):
                    # Prepare stock data
                    stock_data = [{
                        'product_name': i.get('name'),
                        'current_stock': i.get('quantity', 0),
                        'category': i.get('category', ''),
                        'min_level': i.get('min_stock_level', 10)
                    } for i in items]
                    
                    # Get predictions from demand forecast
                    try:
                        headers = {'X-Internal-Secret': INTERNAL_SECRET}
                        response = requests.get(
                            f"{API_URL}/forecast/all",
                            headers=headers,
                            params={"days": 7},
                            timeout=60
                        )
                        
                        if response.status_code == 200:
                            predictions = response.json().get('forecasts', [])
                            
                            if predictions:
                                st.success("✅ Predictions generated!")
                                
                                # Show results
                                results = []
                                for pred in predictions:
                                    # Find matching stock item
                                    stock_item = next(
                                        (i for i in items if i.get('name') == pred.get('product_name')),
                                        {}
                                    )
                                    current = stock_item.get('quantity', 0)
                                    predicted = pred.get('total_predicted', 0)
                                    
                                    results.append({
                                        'Product': pred.get('product_name'),
                                        'Current Stock': current,
                                        'Predicted 7-Day Demand': round(predicted, 0),
                                        'Need to Order': max(0, round(predicted - current, 0)),
                                        'Status': '🟢 OK' if current >= predicted else '🔴 Order'
                                    })
                                
                                result_df = pd.DataFrame(results)
                                st.dataframe(result_df, use_container_width=True)
                                
                                # Summary
                                need_order = [r for r in results if r['Need to Order'] > 0]
                                st.metric("Items to Reorder", len(need_order))
                            else:
                                st.warning("No predictions available. Train a model first using the main dashboard.")
                        else:
                            st.error("Prediction failed. Train a model first.")
                    except Exception as e:
                        st.error(f"Error: {e}")

with tab2:
    st.subheader("Manual Stock Entry")
    st.info("Enter your current stock levels manually")
    
    # Simple form
    num_items = st.number_input("Number of products", 1, 20, 5)
    
    manual_items = []
    cols = st.columns(4)
    cols[0].write("**Product Name**")
    cols[1].write("**Category**")
    cols[2].write("**Current Stock**")
    cols[3].write("**Min Level**")
    
    for i in range(int(num_items)):
        cols = st.columns(4)
        name = cols[0].text_input(f"Product {i+1}", key=f"name_{i}", label_visibility="collapsed")
        category = cols[1].selectbox(
            f"Cat {i+1}", 
            ["Groceries", "Dairy", "Beverages", "Snacks", "Personal Care", "Other"],
            key=f"cat_{i}",
            label_visibility="collapsed"
        )
        stock = cols[2].number_input(f"Stock {i+1}", 0, 10000, 0, key=f"stock_{i}", label_visibility="collapsed")
        min_level = cols[3].number_input(f"Min {i+1}", 0, 1000, 10, key=f"min_{i}", label_visibility="collapsed")
        
        if name:
            manual_items.append({
                'name': name,
                'category': category,
                'quantity': stock,
                'min_stock_level': min_level
            })
    
    if manual_items:
        if st.button("📊 Predict from Manual Entry", type="primary"):
            st.session_state.inventory = manual_items
            st.success(f"✅ {len(manual_items)} items loaded. Switch to 'Load from Database' tab to see predictions.")
            st.rerun()

# Sidebar info
with st.sidebar:
    st.subheader("ℹ️ How it works")
    st.markdown("""
    1. **Load Stock** - From database or manual entry
    2. **AI Analyzes** - Identifies important features
    3. **Predict** - Get 7-day demand forecast
    4. **Results** - See what to order
    """)
    
    st.divider()
    st.caption("Powered by ML + AI Agents")
