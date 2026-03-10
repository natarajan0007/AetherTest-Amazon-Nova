"""Test script to verify Strands Agents SDK integration."""
import os
import sys

# Add the app directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_strands_import():
    """Test that Strands SDK can be imported."""
    try:
        from strands import Agent, tool
        from strands.models.bedrock import BedrockModel
        print("✓ Strands SDK imports successful")
        return True
    except ImportError as e:
        print(f"✗ Strands SDK import failed: {e}")
        print("  Run: pip install strands-agents strands-agents-tools")
        return False

def test_strands_orchestrator_import():
    """Test that our Strands orchestrator can be imported."""
    try:
        from app.agents.strands_orchestrator import StrandsAetherTestOrchestrator
        print("✓ StrandsAetherTestOrchestrator import successful")
        return True
    except ImportError as e:
        print(f"✗ StrandsAetherTestOrchestrator import failed: {e}")
        return False

def test_bedrock_model_creation():
    """Test BedrockModel creation (requires AWS credentials)."""
    try:
        from strands.models.bedrock import BedrockModel
        import boto3
        
        # Check for AWS credentials
        aws_key = os.environ.get('AWS_ACCESS_KEY_ID')
        aws_secret = os.environ.get('AWS_SECRET_ACCESS_KEY')
        
        if not aws_key or not aws_secret:
            print("⚠ AWS credentials not set - skipping BedrockModel test")
            return True
        
        session = boto3.Session(
            aws_access_key_id=aws_key,
            aws_secret_access_key=aws_secret,
            aws_session_token=os.environ.get('AWS_SESSION_TOKEN'),
            region_name=os.environ.get('AWS_REGION', 'us-east-1')
        )
        
        model = BedrockModel(
            boto_session=session,
            model_id="amazon.nova-pro-v1:0",
            max_tokens=1000
        )
        print(f"✓ BedrockModel created: {model.config.get('model_id')}")
        return True
    except Exception as e:
        print(f"✗ BedrockModel creation failed: {e}")
        return False

def test_tool_decorator():
    """Test the @tool decorator."""
    try:
        from strands import tool
        
        @tool
        def test_tool(message: str) -> str:
            """A test tool that echoes a message.
            
            Args:
                message: The message to echo.
            """
            return f"Echo: {message}"
        
        # Verify tool has the expected attributes
        assert hasattr(test_tool, 'tool_spec'), "Tool should have tool_spec attribute"
        print(f"✓ @tool decorator works: {test_tool.tool_spec.get('name', 'unknown')}")
        return True
    except Exception as e:
        print(f"✗ @tool decorator test failed: {e}")
        return False

if __name__ == "__main__":
    print("=" * 50)
    print("Strands Agents SDK Integration Test")
    print("=" * 50)
    print()
    
    results = []
    results.append(test_strands_import())
    results.append(test_tool_decorator())
    results.append(test_strands_orchestrator_import())
    results.append(test_bedrock_model_creation())
    
    print()
    print("=" * 50)
    passed = sum(results)
    total = len(results)
    print(f"Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("✓ All tests passed! Strands integration is ready.")
    else:
        print("✗ Some tests failed. Check the output above.")
    
    sys.exit(0 if passed == total else 1)
